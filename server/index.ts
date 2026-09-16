#!/usr/bin/env node
import express, { Request, Response } from 'express';
import cors from 'cors';
import simpleGit from 'simple-git';
import path from 'path';
import fs from 'fs';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

function getGit(dirPath: string) {
  return simpleGit(dirPath);
}

// 大仓库阈值：祖先探测返回的提交数超过该值时，回退到逐提交判定。
const LARGE_REPO_COMMITS = 50_000;
const PROBE_MAX = LARGE_REPO_COMMITS + 1;

// single-flight：相同 key 的在途请求复用同一个 Promise，避免重复 spawn git。
const inflightGraph = new Map<string, Promise<any>>();

async function withSingleFlight<T>(key: string, task: () => Promise<T>): Promise<T> {
  const existing = inflightGraph.get(key);
  if (existing) return existing;
  const p = (async () => {
    try { return await task(); }
    finally { inflightGraph.delete(key); }
  })();
  inflightGraph.set(key, p);
  return p;
}

// 检查目录是否为Git仓库并获取分支信息
app.post('/api/check-git', async (req: Request, res: Response) => {
  try {
    const { dirPath } = req.body;

    if (!dirPath) {
      return res.status(400).json({ error: '请提供目录路径' });
    }

    if (!fs.existsSync(dirPath)) {
      return res.status(400).json({ error: '目录不存在' });
    }

    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) {
      return res.status(400).json({ error: '路径不是目录' });
    }

    const gitDir = path.join(dirPath, '.git');
    if (!fs.existsSync(gitDir)) {
      return res.json({
        isGitRepo: false,
        path: dirPath,
        message: '该目录不是Git仓库'
      });
    }

    const git = getGit(dirPath);
    const [localBranches, remoteBranches, remoteNames] = await Promise.all([
      git.branchLocal(),
      git.branch(['-r']),
      git.getRemotes()
    ]);
    const remotePrefix = remoteNames.length > 0 ? `${remoteNames[0].name}/` : 'origin/';

    interface BranchWithStatus {
      name: string;
      ahead: number;
      behind: number;
    }

    const localWithStatus: BranchWithStatus[] = await Promise.all(localBranches.all.map(async (name: string) => {
      let ahead = 0, behind = 0;
      try {
        const upstream = remotePrefix + name;
        const count = await git.raw(['rev-list', '--left-right', '--count', `${name}...${upstream}`]);
        const parts = count.trim().split('\t');
        if (parts.length === 2) {
          ahead = parseInt(parts[0], 10);
          behind = parseInt(parts[1], 10);
        }
      } catch (_) {}
      return { name, ahead, behind };
    }));

    res.json({
      isGitRepo: true,
      path: dirPath,
      currentBranch: localBranches.current,
      localBranches: localWithStatus,
      remoteBranches: remoteBranches.all,
      message: 'Git仓库分析完成'
    });

  } catch (error: any) {
    console.error('分析Git仓库时出错:', error);
    res.status(500).json({ error: '分析Git仓库时出错: ' + error.message });
  }
});

// 获取所有盘符（Windows）
app.get('/api/drives', (req: Request, res: Response) => {
  try {
    const drives: { name: string; path: string }[] = [];
    for (let i = 65; i <= 90; i++) {
      const letter = String.fromCharCode(i);
      const drivePath = `${letter}:\\`;
      try {
        if (fs.existsSync(drivePath)) {
          drives.push({ name: `${letter}:`, path: drivePath });
        }
      } catch (e) { /* ignore */ }
    }
    res.json({ drives });
  } catch (error: any) {
    console.error('获取盘符时出错:', error);
    res.status(500).json({ error: '获取盘符时出错' });
  }
});

// 获取目录列表
app.post('/api/list-directory', (req: Request, res: Response) => {
  try {
    const { dirPath } = req.body;
    const targetDir = dirPath || '';

    if (!targetDir) {
      return res.json({ currentPath: '', parentPath: null, directories: [] });
    }

    if (!fs.existsSync(targetDir)) {
      return res.status(400).json({ error: '目录不存在' });
    }

    const stat = fs.statSync(targetDir);
    if (!stat.isDirectory()) {
      return res.status(400).json({ error: '路径不是目录' });
    }

    const parentPath = path.dirname(targetDir);
    const isRoot = parentPath === targetDir;

    const items = fs.readdirSync(targetDir, { withFileTypes: true });
    const directories = items
      .filter(item => item.isDirectory())
      .map(item => ({
        name: item.name,
        path: path.join(targetDir, item.name)
      }));

    res.json({
      currentPath: targetDir,
      parentPath: isRoot ? null : parentPath,
      directories: directories.slice(0, 200)
    });

  } catch (error: any) {
    console.error('列出目录时出错:', error);
    res.status(500).json({ error: '列出目录时出错: ' + error.message });
  }
});

// 迁出指定分支
app.post('/api/checkout', async (req: Request, res: Response) => {
  try {
    const { dirPath, branch } = req.body;
    if (!dirPath || !branch) {
      return res.status(400).json({ error: '缺少参数' });
    }
    const git = getGit(dirPath);

    if (branch.includes('/')) {
      const localName = branch.split('/').slice(1).join('/');
      const branches = await git.branchLocal();
      if (branches.all.includes(localName)) {
        await git.checkout(localName);
        await git.pull();
      } else {
        await git.raw(['checkout', '--track', branch]);
      }
    } else {
      await git.checkout(branch);
    }

    res.json({ ok: true, branch });
  } catch (error: any) {
    console.error('迁出分支时出错:', error);
    res.status(500).json({ error: error.message });
  }
});

interface CommitInfo {
  hash: string;
  author: string;
  email: string;
  date: string;
  message: string;
}

// 获取commit日志（分页）
app.post('/api/commits', async (req: Request, res: Response) => {
  try {
    const { dirPath, branch, page = 1, pageSize = 50 } = req.body;
    if (!dirPath || !branch) {
      return res.status(400).json({ error: '缺少参数' });
    }
    const git = getGit(dirPath);
    const skip = (page - 1) * pageSize;
    const logArgs = pageSize > 0
      ? ['log', branch, `--skip=${skip}`, `--max-count=${pageSize}`, '--format=%H||%an||%ae||%ai||%s']
      : ['log', branch, '--format=%H||%an||%ae||%ai||%s'];
    const [raw, totalRaw] = await Promise.all([
      git.raw(logArgs),
      git.raw(['rev-list', '--count', branch])
    ]);
    const commits: CommitInfo[] = raw.trim().split('\n').filter(Boolean).map(line => {
      const [hash, author, email, date, ...msgParts] = line.split('||');
      return { hash, author, email, date, message: msgParts.join('||') };
    });
    res.json({ branch, commits, totalCount: parseInt(totalRaw.trim(), 10) || 0, page, pageSize });
  } catch (error: any) {
    console.error('获取commit日志时出错:', error);
    res.status(500).json({ error: error.message });
  }
});

interface GraphRow {
  graph: string;
  commit: {
    hash: string;
    parents: string;
    message: string;
    author: string;
    date: string;
    refs: string;
  } | null;
}

interface CommitGraphPayload {
  rows: GraphRow[];
  total: number;
  page: number;
  pageSize: number;
  headHash?: string;
}

// 纯计算：取数、解析、插入连接行、判定祖先与待推送，返回 payload（不触碰 res）。
async function computeCommitGraph(
  dirPath: string,
  page: number,
  pageSize: number,
  branch?: string
): Promise<CommitGraphPayload> {
    const git = getGit(dirPath);

    const revListArgs = branch ? ['rev-list', branch, '--count'] : ['rev-list', '--all', '--count'];
    const totalRaw = await git.raw(revListArgs);
    const total = parseInt(totalRaw.trim(), 10) || 0;

    const skip = (page - 1) * pageSize;
    const graphSep = '|||GRAPH_DAT|||';
    const logArgs = branch ? [branch] : ['--all'];
    const args = ['log', ...logArgs, '--graph', `--pretty=format:${graphSep}%H|||%P|||%s|||%an|||%aI|||%d`];
    if (skip > 0) args.push(`--skip=${skip}`);
    if (pageSize > 0) args.push(`--max-count=${pageSize}`);

    const raw = await git.raw(args);
    if (!raw.trim()) {
      return { rows: [], total, page, pageSize };
    }

    const headHash = (await git.raw(['rev-parse', 'HEAD'])).trim();

    const lines = raw.split('\n').map(l => l.replace(/\r$/, '')).filter(Boolean);
    const rows: GraphRow[] = [];
    for (const line of lines) {
      const sepIdx = line.indexOf(graphSep);
      if (sepIdx === -1) {
        rows.push({ graph: line, commit: null });
        continue;
      }
      const graphPart = line.substring(0, sepIdx);
      const dataPart = line.substring(sepIdx + graphSep.length);
      const parts = dataPart.split('|||');
      rows.push({
        graph: graphPart,
        commit: {
          hash: parts[0] || '',
          parents: parts[1] || '',
          message: parts[2] || '',
          author: parts[3] || '',
          date: parts[4] || '',
          refs: parts[5] || ''
        }
      });
    }
    // Insert visual connector rows between consecutive commits on the same lane
    const finalRows: GraphRow[] = [];
    for (let i = 0; i < rows.length; i++) {
      if (i > 0 && rows[i].commit && rows[i - 1].commit) {
        const currStar = rows[i].graph.indexOf('*');
        const prevStar = rows[i - 1].graph.indexOf('*');
        if (currStar !== -1 && prevStar !== -1 && currStar === prevStar) {
          const maxLen = Math.max(rows[i - 1].graph.length, rows[i].graph.length);
          let conn = '';
          for (let j = 0; j < maxLen; j++) conn += j === prevStar ? '|' : ' ';
          finalRows.push({ graph: conn, commit: null });
        }
      }
      finalRows.push(rows[i]);
    }
    const commitHashes = finalRows.filter(r => r.commit).map(r => r.commit!.hash);
    const headAncestorMap: Record<string, boolean> = {};
    // 一次有界探测替代 N 次 merge-base：`rev-list HEAD` 的输出集合即「HEAD 的祖先」全集。
    // 探测带 --max-count 上限，避免大仓库把整条历史拉进内存。
    let ancestorSet: Set<string> | null = null;
    let probeFailed = false;
    try {
      const probe = await git.raw(['rev-list', `--max-count=${PROBE_MAX}`, 'HEAD']);
      const hashes = probe.trim().split('\n').map(l => l.trim()).filter(Boolean);
      if (hashes.length <= LARGE_REPO_COMMITS) ancestorSet = new Set(hashes);
    } catch (_) {
      probeFailed = true;   // 未出生 HEAD / 空仓库
    }
    if (ancestorSet) {
      const set = ancestorSet;
      commitHashes.forEach(h => { headAncestorMap[h] = set.has(h); });
    } else if (probeFailed) {
      commitHashes.forEach(h => { headAncestorMap[h] = false; });
    } else {
      // 大仓库：回退到逐提交判定（与原行为一致，但仅在超过阈值时才发生）
      const results = await Promise.all(
        commitHashes.map(async h => {
          try { return (await git.raw(['merge-base', 'HEAD', h])).trim() === h; }
          catch { return false; }
        })
      );
      commitHashes.forEach((h, i) => { headAncestorMap[h] = results[i]; });
    }

    // Determine which commits need push (local-only commits for the selected branch)
    let needsPushSet: Set<string> | null = null;
    if (branch) {
      try {
        const remoteNames = await git.getRemotes();
        const remotePrefix = remoteNames.length > 0 ? `${remoteNames[0].name}/` : 'origin/';
        const unpushedRaw = await git.raw(['rev-list', `${remotePrefix}${branch}..${branch}`]);
        if (unpushedRaw.trim()) {
          needsPushSet = new Set(unpushedRaw.trim().split('\n').map(l => l.trim()).filter(Boolean));
        }
      } catch (_) {}
    }

    for (const row of finalRows) {
      if (row.commit) {
        (row.commit as any).isOnHeadBranch = headAncestorMap[row.commit.hash] || false;
        (row.commit as any).needsPush = needsPushSet ? needsPushSet.has(row.commit.hash) : false;
      }
    }
    return { rows: finalRows, total, page, pageSize, headHash };
}

// 获取提交历史分支图
app.post('/api/commit-graph', async (req: Request, res: Response) => {
  try {
    const { dirPath, page = 1, pageSize = 50, branch } = req.body;
    if (!dirPath) return res.status(400).json({ error: '缺少参数' });
    const key = `${path.resolve(dirPath)}|${branch || '--all'}|${page}|${pageSize}`;
    const payload = await withSingleFlight(key, () => computeCommitGraph(dirPath, page, pageSize, branch));
    res.json(payload);
  } catch (error: any) {
    console.error('获取提交图时出错:', error);
    res.status(500).json({ error: error.message });
  }
});

// 从指定源分支创建新分支
app.post('/api/create-branch', async (req: Request, res: Response) => {
  try {
    const { dirPath, branchName, sourceBranch } = req.body;
    if (!dirPath || !branchName) {
      return res.status(400).json({ error: '缺少参数' });
    }
    const git = getGit(dirPath);
    const args = ['branch', branchName];
    if (sourceBranch) args.push(sourceBranch);
    await git.raw(args);
    res.json({ ok: true, branch: branchName });
  } catch (error: any) {
    console.error('创建分支时出错:', error);
    res.status(500).json({ error: error.message });
  }
});

// 合并分支到当前分支
app.post('/api/merge-branch', async (req: Request, res: Response) => {
  try {
    const { dirPath, sourceBranch } = req.body;
    if (!dirPath || !sourceBranch) {
      return res.status(400).json({ error: '缺少参数' });
    }
    const git = getGit(dirPath);
    const output = await git.raw(['merge', sourceBranch]);
    if (output.includes('CONFLICT')) {
      const status = await git.raw(['diff', '--name-only', '--diff-filter=U']);
      const files = status.split('\n').filter(Boolean);
      return res.json({ conflict: true, files, type: 'merge' });
    }
    res.json({ ok: true });
  } catch (error: any) {
    console.error('合并分支时出错:', error);
    const git = getGit(req.body.dirPath);
    try {
      const status = await git.raw(['diff', '--name-only', '--diff-filter=U']);
      const files = status.split('\n').filter(Boolean);
      if (files.length > 0) {
        return res.json({ conflict: true, files, type: 'merge' });
      }
    } catch (_) {}
    res.status(500).json({ error: error.message });
  }
});

// 优选（cherry-pick）
app.post('/api/cherry-pick', async (req: Request, res: Response) => {
  try {
    const { dirPath, commitHash } = req.body;
    if (!dirPath || !commitHash) {
      return res.status(400).json({ error: '缺少参数' });
    }
    const git = getGit(dirPath);
    await git.raw(['cherry-pick', commitHash]);
    res.json({ ok: true });
    } catch (error: any) {
    console.error('优选时出错:', error);
    const cpGit = getGit(req.body.dirPath);
    try {
      const status = await cpGit.raw(['diff', '--name-only', '--diff-filter=U']);
      const files = status.split('\n').filter(Boolean);
      if (files.length > 0) {
        let theirsBranch = '';
        try {
          const branches = await cpGit.raw(['branch', '--contains', req.body.commitHash]);
          const names = branches.split('\n').map((l: string) => l.trim().replace(/^\*?\s*/, '')).filter(Boolean);
          theirsBranch = names[0] || '';
        } catch (_) {}
        return res.json({ conflict: true, files, type: 'cherry-pick', theirsBranch });
      }
    } catch (_) {}
    res.status(500).json({ error: error.message });
  }
});

// 还原提交 (revert)
app.post('/api/revert-commit', async (req: Request, res: Response) => {
  try {
    const { dirPath, commitHash } = req.body;
    if (!dirPath || !commitHash) {
      return res.status(400).json({ error: '缺少参数' });
    }
    const git = getGit(dirPath);
    await git.raw(['revert', '--no-edit', commitHash]);
    res.json({ ok: true });
  } catch (error: any) {
    console.error('还原时出错:', error);
    const rvGit = getGit(req.body.dirPath);
    try {
      const status = await rvGit.raw(['diff', '--name-only', '--diff-filter=U']);
      const files = status.split('\n').filter(Boolean);
      if (files.length > 0) {
        return res.json({ conflict: true, files, type: 'revert' });
      }
    } catch (_) {}
    res.status(500).json({ error: error.message });
  }
});

// 删除提交 (drop commit)
app.post('/api/drop-commit', async (req: Request, res: Response) => {
  try {
    const { dirPath, commitHash, parentHash, branch } = req.body;
    if (!dirPath || !commitHash || !parentHash || !branch) {
      return res.status(400).json({ error: '缺少参数' });
    }
    const git = getGit(dirPath);
    await git.raw(['rebase', '--onto', parentHash, commitHash, branch]);
    res.json({ ok: true });
  } catch (error: any) {
    console.error('删除提交时出错:', error);
    res.status(500).json({ error: error.message });
  }
});

// Git Reset（重置到此提交）
const VALID_RESET_TYPES = ['hard', 'soft', 'mixed'];
app.post('/api/reset-commit', async (req: Request, res: Response) => {
  try {
    const { dirPath, commitHash, resetType } = req.body;
    if (!dirPath || !commitHash || !resetType) {
      return res.status(400).json({ error: '缺少参数' });
    }
    if (!VALID_RESET_TYPES.includes(resetType)) {
      return res.status(400).json({ error: '无效的重置类型，仅支持 hard/soft/mixed' });
    }
    const git = getGit(dirPath);
    await git.raw(['reset', `--${resetType}`, commitHash]);
    res.json({ ok: true });
  } catch (error: any) {
    console.error('重置时出错:', error);
    res.status(500).json({ error: error.message });
  }
});

// 重命名分支
app.post('/api/rename-branch', async (req: Request, res: Response) => {
  try {
    const { dirPath, oldName, newName } = req.body;
    if (!dirPath || !oldName || !newName) {
      return res.status(400).json({ error: '缺少参数' });
    }
    const git = getGit(dirPath);
    await git.branch(['-m', oldName, newName]);
    res.json({ ok: true, branch: newName });
  } catch (error: any) {
    console.error('重命名分支时出错:', error);
    res.status(500).json({ error: error.message });
  }
});

// 删除分支
app.post('/api/delete-branch', async (req: Request, res: Response) => {
  try {
    const { dirPath, branch, force } = req.body;
    if (!dirPath || !branch) {
      return res.status(400).json({ error: '缺少参数' });
    }
    const git = getGit(dirPath);
    try {
      await git.branch([force ? '-D' : '-d', branch]);
    } catch (err: any) {
      // 如果分支未合并，提示是否强制删除
      if (err.message?.includes('not fully merged')) {
        return res.status(409).json({ error: err.message, needsForce: true, branch });
      }
      throw err;
    }
    res.json({ ok: true });
  } catch (error: any) {
    console.error('删除分支时出错:', error);
    res.status(500).json({ error: error.message });
  }
});

interface PendingCommit {
  hash: string;
  message: string;
  date: string;
  author: string;
}

// 获取待推送的提交列表
app.post('/api/pending-commits', async (req: Request, res: Response) => {
  try {
    const { dirPath, branch } = req.body;
    if (!dirPath || !branch) {
      return res.status(400).json({ error: '缺少参数' });
    }
    const git = getGit(dirPath);
    const log = await git.log([`origin/${branch}..${branch}`]);
    const commits: PendingCommit[] = log.all.map(c => ({ hash: c.hash, message: c.message, date: c.date, author: c.author_name }));
    res.json({ commits });
  } catch (error) {
    res.json({ commits: [] });
  }
});

// 推送分支
app.post('/api/push', async (req: Request, res: Response) => {
  try {
    const { dirPath, branch } = req.body;
    if (!dirPath || !branch) {
      return res.status(400).json({ error: '缺少参数' });
    }
    const git = getGit(dirPath);
    await git.push('origin', branch);
    res.json({ ok: true });
  } catch (error: any) {
    console.error('推送分支时出错:', error);
    const remoteDirPath = req.body.dirPath;
    let remoteUrl = '';
    if (remoteDirPath) {
      try {
        const remotes = await getGit(remoteDirPath).getRemotes(true);
        if (remotes.length > 0) remoteUrl = remotes[0].refs.push || remotes[0].refs.fetch || '';
      } catch (_) {}
    }
    const prefix = remoteUrl ? `远程仓库链接失败: ${remoteUrl} ` : '';
    res.status(500).json({ error: `${prefix}${error.message}` });
  }
});

// 拉取更新（fetch --all）
app.post('/api/fetch', async (req: Request, res: Response) => {
  try {
    const { dirPath } = req.body;
    if (!dirPath) {
      return res.status(400).json({ error: '缺少参数' });
    }
    const git = getGit(dirPath);
    await git.fetch(['--all']);
    res.json({ ok: true });
  } catch (error: any) {
    console.error('拉取更新时出错:', error);
    const remoteDirPath = req.body.dirPath;
    let remoteUrl = '';
    if (remoteDirPath) {
      try {
        const remotes = await getGit(remoteDirPath).getRemotes(true);
        if (remotes.length > 0) remoteUrl = remotes[0].refs.push || remotes[0].refs.fetch || '';
      } catch (_) {}
    }
    const prefix = remoteUrl ? `远程仓库链接失败: ${remoteUrl} ` : '';
    res.status(500).json({ error: `${prefix}${error.message}` });
  }
});

// 拉取指定分支（git pull — 分离 fetch + merge，避免 FETCH_HEAD 歧义）
app.post('/api/pull-branch', async (req: Request, res: Response) => {
  try {
    const { dirPath, branch } = req.body;
    if (!dirPath || !branch) {
      return res.status(400).json({ error: '缺少参数' });
    }
    const git = getGit(dirPath);
    const currentBranch = (await git.branchLocal()).current;
    if (branch === currentBranch) {
      await git.raw(['fetch', 'origin', branch]);
      await git.raw(['merge', '--ff-only', `origin/${branch}`]);
    } else {
      await git.raw(['fetch', 'origin', `${branch}:${branch}`]);
    }
    res.json({ ok: true });
  } catch (error: any) {
    console.error('拉取分支时出错:', error);
    res.status(500).json({ error: error.message });
  }
});

interface SimpleCommit {
  hash: string;
  message: string;
}

// 比较两个分支的commit差异（双向）
app.post('/api/compare-branches', async (req: Request, res: Response) => {
  try {
    const { dirPath, baseBranch, compareBranch } = req.body;
    if (!dirPath || !baseBranch || !compareBranch) {
      return res.status(400).json({ error: '缺少参数' });
    }
    const git = getGit(dirPath);
    const [compareCountRaw, baseCountRaw, compareAheadRaw, baseAheadRaw] = await Promise.all([
      git.raw(['rev-list', '--count', `${baseBranch}..${compareBranch}`]),
      git.raw(['rev-list', '--count', `${compareBranch}..${baseBranch}`]),
      git.raw(['log', `${baseBranch}..${compareBranch}`, '--oneline', '--max-count=50']),
      git.raw(['log', `${compareBranch}..${baseBranch}`, '--oneline', '--max-count=50'])
    ]);
    const parse = (raw: string): SimpleCommit[] => raw.trim().split('\n').filter(Boolean).map(line => {
      const [hash, ...msgParts] = line.split(' ');
      return { hash, message: msgParts.join(' ') };
    });
    const compareCount = parseInt(compareCountRaw.trim(), 10) || 0;
    const baseCount = parseInt(baseCountRaw.trim(), 10) || 0;
    res.json({ compareAhead: parse(compareAheadRaw), compareAheadTotal: compareCount, baseAhead: parse(baseAheadRaw), baseAheadTotal: baseCount });
  } catch (error: any) {
    console.error('比较分支时出错:', error);
    res.status(500).json({ error: error.message });
  }
});

// 将当前分支变基到目标分支
app.post('/api/rebase-branch', async (req: Request, res: Response) => {
  try {
    const { dirPath, targetBranch } = req.body;
    if (!dirPath || !targetBranch) {
      return res.status(400).json({ error: '缺少参数' });
    }
    const git = getGit(dirPath);
    await git.raw(['rebase', targetBranch]);
    res.json({ ok: true });
  } catch (error: any) {
    console.error('变基分支时出错:', error);
    const git = getGit(req.body.dirPath);
    try {
      const status = await git.raw(['diff', '--name-only', '--diff-filter=U']);
      const files = status.split('\n').filter(Boolean);
      if (files.length > 0) {
        return res.json({ conflict: true, files, type: 'rebase' });
      }
    } catch (_) {}
    res.status(500).json({ error: error.message });
  }
});

// 获取冲突文件列表
app.post('/api/conflict-files', async (req: Request, res: Response) => {
  try {
    const { dirPath } = req.body;
    if (!dirPath) return res.status(400).json({ error: '缺少参数' });
    const git = getGit(dirPath);
    const status = await git.raw(['diff', '--name-only', '--diff-filter=U']);
    const files = status.split('\n').filter(Boolean);
    let type: string | null = null;
    let theirsBranch: string | null = null;
    const gitDir = path.join(dirPath, '.git');
    if (files.length > 0) {
      try { await fs.promises.access(path.join(gitDir, 'MERGE_HEAD')); type = 'merge'; } catch (_) {}
      if (!type) {
        try { await fs.promises.access(path.join(gitDir, 'rebase-merge')); type = 'rebase'; } catch (_) {}
      }
      if (!type) {
        try { await fs.promises.access(path.join(gitDir, 'rebase-apply')); type = 'rebase'; } catch (_) {}
      }
      if (!type) {
        try { await fs.promises.access(path.join(gitDir, 'CHERRY_PICK_HEAD')); type = 'cherry-pick'; } catch (_) {}
      }
      if (!type) type = 'merge';
      try {
        if (type === 'merge') {
          const mergeMsg = await fs.promises.readFile(path.join(gitDir, 'MERGE_MSG'), 'utf-8');
          const m = mergeMsg.match(/^Merge branch ['"]([^'"]+)/);
          if (m) theirsBranch = m[1];
        } else if (type === 'rebase') {
          const headRef = await fs.promises.readFile(path.join(gitDir, 'rebase-merge', 'head-name'), 'utf-8');
          theirsBranch = headRef.trim().replace('refs/heads/', '');
        } else if (type === 'cherry-pick') {
          try {
            const hash = (await fs.promises.readFile(path.join(gitDir, 'CHERRY_PICK_HEAD'), 'utf-8')).trim();
            const branches = await git.raw(['branch', '--contains', hash]);
            const names = branches.split('\n').map(l => l.trim().replace(/^\*?\s*/, '')).filter(Boolean);
            theirsBranch = names[0] || hash.slice(0, 7);
          } catch (_) { theirsBranch = ''; }
        }
      } catch (_) {}
    }
    res.json({ files, type, theirsBranch });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

interface HunkInfo {
  ourStart: number;
  ourCount: number;
  theirStart: number;
  theirCount: number;
}

// 获取冲突文件的 our/theirs 内容
app.post('/api/conflict-file-content', async (req: Request, res: Response) => {
  try {
    const { dirPath, filePath } = req.body;
    if (!dirPath || !filePath) return res.status(400).json({ error: '缺少参数' });
    const git = getGit(dirPath);
    let ours = '', theirs = '';
    let oursOk = true, theirsOk = true;
    try { ours = await git.raw(['show', ':2:' + filePath]); } catch (_) { oursOk = false; }
    try { theirs = await git.raw(['show', ':3:' + filePath]); } catch (_) { theirsOk = false; }
    if (!oursOk) {
      try { ours = await git.raw(['show', ':1:' + filePath]); } catch (_) { ours = ''; }
    }
    if (!theirsOk) {
      try { theirs = await git.raw(['show', ':1:' + filePath]); } catch (_) { theirs = ''; }
    }
    const hunks: HunkInfo[] = [];
    try {
      const diff = await git.raw(['diff', '--unified=0', `:${oursOk ? '2' : '1'}:${filePath}`, `:3:${filePath}`]);
      const hunkRegex = /@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/g;
      let m: RegExpExecArray | null;
      while ((m = hunkRegex.exec(diff)) !== null) {
        hunks.push({
          ourStart: parseInt(m[1]),
          ourCount: parseInt(m[2]) || 1,
          theirStart: parseInt(m[3]),
          theirCount: parseInt(m[4]) || 1,
        });
      }
    } catch (_) {}
    res.json({ ours, theirs, hunks });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 中止合并或变基
app.post('/api/abort-merge', async (req: Request, res: Response) => {
  try {
    const { dirPath } = req.body;
    if (!dirPath) return res.status(400).json({ error: '缺少参数' });
    const git = getGit(dirPath);
    const gitDir = path.join(dirPath, '.git');
    let isCherryPick = false;
    let isRevert = false;
    try { await fs.promises.access(path.join(gitDir, 'CHERRY_PICK_HEAD')); isCherryPick = true; } catch (_) {}
    if (!isCherryPick) {
      try { await fs.promises.access(path.join(gitDir, 'REVERT_HEAD')); isRevert = true; } catch (_) {}
    }
    if (isCherryPick) {
      await git.raw(['cherry-pick', '--abort']);
    } else if (isRevert) {
      await git.raw(['revert', '--abort']);
    } else {
      try {
        await git.raw(['merge', '--abort']);
      } catch (_) {
        await git.raw(['rebase', '--abort']);
      }
    }
    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 解决冲突文件（写入内容并 git add）
app.post('/api/resolve-conflict-file', async (req: Request, res: Response) => {
  try {
    const { dirPath, filePath, content } = req.body;
    if (!dirPath || !filePath || content === undefined) {
      return res.status(400).json({ error: '缺少参数' });
    }
    const git = getGit(dirPath);
    const fullPath = path.join(dirPath, filePath);
    await fs.promises.writeFile(fullPath, content, 'utf-8');
    await git.raw(['add', filePath]);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 继续合并/变基（所有冲突解决后）
app.post('/api/continue-merge', async (req: Request, res: Response) => {
  try {
    const { dirPath } = req.body;
    if (!dirPath) return res.status(400).json({ error: '缺少参数' });
    const git = getGit(dirPath);
    const gitDir = path.join(dirPath, '.git');
    let isMerge = false;
    let isCherryPick = false;
    let isRevert = false;
    try { await fs.promises.access(path.join(gitDir, 'MERGE_HEAD')); isMerge = true; } catch (_) {}
    if (!isMerge) {
      try { await fs.promises.access(path.join(gitDir, 'CHERRY_PICK_HEAD')); isCherryPick = true; } catch (_) {}
    }
    if (!isMerge && !isCherryPick) {
      try { await fs.promises.access(path.join(gitDir, 'REVERT_HEAD')); isRevert = true; } catch (_) {}
    }
    if (isMerge) {
      await git.raw(['commit', '--no-edit']);
    } else if (isCherryPick) {
      await git.raw(['cherry-pick', '--continue']);
    } else if (isRevert) {
      await git.raw(['revert', '--continue']);
    } else {
      await git.env('GIT_EDITOR', 'true').env('GIT_SEQUENCE_EDITOR', 'true').raw(['rebase', '--continue']);
    }
    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 获取单个commit的diff
app.post('/api/commit-diff', async (req: Request, res: Response) => {
  try {
    const { dirPath, commitHash } = req.body;
    if (!dirPath || !commitHash) {
      return res.status(400).json({ error: '缺少参数' });
    }
    const git = getGit(dirPath);
    const diff = await git.raw(['show', commitHash, '--no-color', '--format=%H||%s||%an||%ai']);
    const lines = diff.split('\n');
    const header = lines[0];
    const [headerHash, headerMsg, headerAuthor, headerDate] = header.split('||');
    const content = lines.slice(1).join('\n');
    res.json({ commitHash: headerHash, message: headerMsg, author: headerAuthor, date: headerDate, diff: content });
  } catch (error: any) {
    console.error('获取diff时出错:', error);
    res.status(500).json({ error: error.message });
  }
});

interface FileEntry {
  status: string;
  filePath: string;
}

// 获取某次 commit 修改的文件列表
app.post('/api/commit-files', async (req: Request, res: Response) => {
  try {
    const { dirPath, commitHash } = req.body;
    if (!dirPath || !commitHash) {
      return res.status(400).json({ error: '缺少参数' });
    }
    const git = getGit(dirPath);
    const raw = await git.raw(['diff-tree', '--no-commit-id', '-r', '--name-status', commitHash]);
    const files: FileEntry[] = raw.trim().split('\n').filter(Boolean).map(line => {
      const [status, ...fileParts] = line.split('\t');
      return { status, filePath: fileParts.join('\t') };
    });
    res.json({ commitHash, files });
  } catch (error: any) {
    console.error('获取commit文件列表时出错:', error);
    res.status(500).json({ error: error.message });
  }
});

// 获取某次 commit 中某个文件的 diff
app.post('/api/commit-file-diff', async (req: Request, res: Response) => {
  try {
    const { dirPath, commitHash, filePath } = req.body;
    if (!dirPath || !commitHash || !filePath) {
      return res.status(400).json({ error: '缺少参数' });
    }
    const git = getGit(dirPath);
    const raw = await git.raw(['show', commitHash, '--', filePath, '--no-color']);
    const diffLines = raw.split('\n').filter(line =>
      (line.startsWith('+') || line.startsWith('-')) &&
      !line.startsWith('--- ') && !line.startsWith('+++ ')
    );
    const diff = diffLines.join('\n');
    res.json({ commitHash, filePath, diff });
  } catch (error: any) {
    console.error('获取文件diff时出错:', error);
    res.status(500).json({ error: error.message });
  }
});

interface DiffRow {
  oldLine: number | null;
  oldContent: string | null;
  oldType: string | null;
  newLine: number | null;
  newContent: string | null;
  newType: string | null;
}

function parseDiff(diffOutput: string): DiffRow[] {
  const rows: DiffRow[] = [];
  const lines = diffOutput.split('\n');
  let oldLineNum = 0;
  let newLineNum = 0;

  for (const line of lines) {
    const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (hunkMatch) {
      oldLineNum = parseInt(hunkMatch[1], 10);
      newLineNum = parseInt(hunkMatch[3], 10);
      continue;
    }
    if (line.startsWith('--- ') || line.startsWith('+++ ') || line.startsWith('diff --git') || line.startsWith('index ')) {
      continue;
    }
    if (!line) continue;

    if (line.startsWith(' ')) {
      const content = line.slice(1);
      rows.push({ oldLine: oldLineNum++, oldContent: content, oldType: 'normal', newLine: newLineNum++, newContent: content, newType: 'normal' });
    } else if (line.startsWith('-')) {
      rows.push({ oldLine: oldLineNum++, oldContent: line.slice(1), oldType: 'remove', newLine: null, newContent: null, newType: null });
    } else if (line.startsWith('+')) {
      rows.push({ oldLine: null, oldContent: null, oldType: null, newLine: newLineNum++, newContent: line.slice(1), newType: 'add' });
    }
  }

  return rows;
}

interface StatusEntry {
  path: string;
  status: string;
}

// 获取本地修改状态
app.post('/api/local-status', async (req: Request, res: Response) => {
  try {
    const { dirPath } = req.body;
    if (!dirPath) return res.status(400).json({ error: '缺少参数' });
    const git = getGit(dirPath);
    // 用 -z：NUL 分隔，git 不对路径做引号 / 八进制转义，含空格与中文的路径可直接使用
    const raw = await git.raw(['status', '--porcelain', '-z']);
    const staged: StatusEntry[] = [];
    const unstaged: StatusEntry[] = [];
    const entries = raw.split('\0');
    // 去掉结尾 NUL 产生的空串
    if (entries.length > 0 && entries[entries.length - 1] === '') entries.pop();
    for (let n = 0; n < entries.length; n++) {
      const entry = entries[n];
      if (!entry || entry.length < 3) continue;
      const idx = entry[0];
      const wd = entry[1];
      const filePath = entry.slice(3);
      // -z 模式下重命名/复制：当前条目是【新路径】，紧接着的下一个 NUL 条目是【原路径】，需消费掉
      if (idx === 'R' || idx === 'C' || wd === 'R' || wd === 'C') {
        n++;
      }
      if (idx === 'U' || wd === 'U') continue;
      // 移除目录斜杠后缀（git 对未追踪目录输出 dirname/）
      const cleanPath = filePath.replace(/\/$/, '');
      if (idx !== ' ' && idx !== '?' && idx !== '!') {
        staged.push({ path: cleanPath, status: idx === 'M' ? 'modified' : idx === 'A' ? 'added' : idx === 'D' ? 'deleted' : idx === 'R' ? 'renamed' : idx });
      }
      if (idx === '?' && wd === '?') {
        unstaged.push({ path: cleanPath, status: 'untracked' });
      } else if (wd !== ' ' && idx !== '?') {
        unstaged.push({ path: cleanPath, status: wd === 'M' ? 'modified' : wd === 'D' ? 'deleted' : wd });
      }
    }
    res.json({ staged, unstaged });
  } catch (error: any) {
    console.error('获取本地状态时出错:', error);
    res.status(500).json({ error: error.message });
  }
});

// 获取本地文件 diff
app.post('/api/local-file-diff', async (req: Request, res: Response) => {
  try {
    const { dirPath, filePath, type } = req.body;
    if (!dirPath || !filePath || !type) {
      return res.status(400).json({ error: '缺少参数' });
    }
    // 每次取新实例，避免缓存实例被 .env() 原地改状态
    const git = getGit(dirPath);

    // 超大文件阈值与单文件最大返回行数
    const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2MB，已追踪文件的降级阈值
    const MAX_UNTRACKED_BYTES = 50 * 1024 * 1024; // 50MB，未追踪文件仅用于防 OOM 的保护上限
    const MAX_ROWS = 5000;

    // (a) 未追踪文件单独取证：git diff 对 ?? 文件零输出，需直接读文件内容
    // 用 -z 避免 git 对含空格/非 ASCII 的路径加引号转义，路径口径与 /api/local-status 一致
    let statusRaw = '';
    try {
      statusRaw = await git.raw(['status', '--porcelain', '-z', '--', filePath]);
    } catch (_) {
      statusRaw = '';
    }
    const isUntracked = statusRaw.slice(0, 2) === '??';

    if (isUntracked) {
      const absPath = path.join(dirPath, filePath);
      let canRenderAsAdd = true;
      try {
        const stat = fs.statSync(absPath);
        if (!stat.isFile() || stat.size > MAX_UNTRACKED_BYTES) {
          // 目录 / 非常规文件，或仅防 OOM 的超大文件：放弃渲染；
          // 常规文件即使很大，也会交由下方 MAX_ROWS 截断 + degraded 提示接管
          canRenderAsAdd = false;
        } else {
          // 读取文件前 8192 字节，若含 NUL 字节则视为二进制文件
          const fd = fs.openSync(absPath, 'r');
          try {
            const bufLen = Math.min(8192, stat.size);
            const buf = Buffer.alloc(bufLen);
            fs.readSync(fd, buf, 0, bufLen, 0);
            if (buf.includes(0)) canRenderAsAdd = false;
          } finally {
            fs.closeSync(fd);
          }
        }
      } catch (_) {
        // 文件不存在或读取失败 → 保持空态（与旧行为一致，不算回归）
        canRenderAsAdd = false;
      }

      if (!canRenderAsAdd) {
        return res.json({ filePath, type, rows: [], degraded: false });
      }

      // 纵深防御：stat 之后文件可能被删除/换成目录（EISDIR 等竞态），
      // 任何读取异常都优雅降级为空态，而不是冒泡成 500
      let lines: string[];
      try {
        let content = fs.readFileSync(absPath, 'utf8');
        if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1); // 去掉 BOM
        lines = content.split(/\r?\n/);
        // 文件以换行结尾时 split 会产生一个末尾空串，git diff 不会为最后的换行单独成行，故去掉
        if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
      } catch (_) {
        return res.json({ filePath, type, rows: [], degraded: false });
      }

      let degraded = false;
      if (lines.length > MAX_ROWS) {
        lines = lines.slice(0, MAX_ROWS);
        degraded = true;
      }

      const rows: DiffRow[] = lines.map((line, i) => ({
        oldLine: null, oldContent: null, oldType: null,
        newLine: i + 1, newContent: line, newType: 'add',
      }));
      return res.json({ filePath, type, rows, degraded });
    }

    // 构造 diff 参数：full=true 放开上下文（-U1000000），否则默认 -U3
    const buildArgs = (full: boolean): string[] => {
      const args = ['diff', '--no-color'];
      if (full) args.push('-U1000000');
      if (type === 'staged') args.push('--cached');
      args.push('--', filePath);
      return args;
    };

    // (b)(c) 已追踪文件：先做廉价体积检查，超过阈值直接用 -U3
    let degraded = false;
    let useFullContext = true;
    try {
      let size = -1;
      if (type === 'staged') {
        const sizeStr = await git.raw(['cat-file', '-s', ':' + filePath]);
        size = parseInt(sizeStr.trim(), 10);
      } else {
        size = fs.statSync(path.join(dirPath, filePath)).size;
      }
      if (Number.isFinite(size) && size > MAX_FILE_BYTES) {
        useFullContext = false;
        degraded = true;
      }
    } catch (_) {
      // 体积检查失败（文件已删除、路径含特殊字符等）→ 跳过体积检查继续全文流程
      useFullContext = true;
    }

    let rows = parseDiff(await git.raw(buildArgs(useFullContext)));

    // 事后再兜一层：全文流程产出行数超上限则降级为默认 -U3
    if (useFullContext && rows.length > MAX_ROWS) {
      rows = parseDiff(await git.raw(buildArgs(false)));
      degraded = true;
    }

    res.json({ filePath, type, rows, degraded });
  } catch (error: any) {
    console.error('获取文件diff时出错:', error);
    res.status(500).json({ error: error.message });
  }
});

// 回退(restore)选中的未暂存文件
app.post('/api/local-restore-file', async (req: Request, res: Response) => {
  try {
    const { dirPath, selectedFiles } = req.body;
    if (!dirPath || !selectedFiles || selectedFiles.length === 0) {
      return res.status(400).json({ error: '缺少参数或未选择文件' });
    }
    const git = getGit(dirPath);
    const BATCH_SIZE = 100;
    const failed: string[] = [];
    for (let i = 0; i < selectedFiles.length; i += BATCH_SIZE) {
      const batch = selectedFiles.slice(i, i + BATCH_SIZE);
      try {
        await git.checkout(['--', ...batch]);
      } catch (e) {
        // 批量失败时逐个尝试，记录失败的文件
        for (const file of batch) {
          try {
            await git.checkout(['--', file]);
          } catch (e2) {
            failed.push(file);
          }
        }
      }
    }
    res.json({ ok: true, failed });
  } catch (error: any) {
    console.error('回退文件时出错:', error);
    res.status(500).json({ error: error.message });
  }
});

// 删除未追踪文件或目录
async function deleteFileOrDir(fullPath: string): Promise<boolean> {
  try {
    if (!fs.existsSync(fullPath)) return true;
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      fs.rmSync(fullPath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(fullPath);
    }
    return true;
  } catch {
    return false;
  }
}

// 删除未追踪的文件
app.post('/api/local-delete-files', async (req: Request, res: Response) => {
  try {
    const { dirPath, selectedFiles } = req.body;
    if (!dirPath || !selectedFiles || selectedFiles.length === 0) {
      return res.status(400).json({ error: '缺少参数或未选择文件' });
    }
    const failed: string[] = [];
    for (const file of selectedFiles) {
      const fullPath = path.join(dirPath, file);
      if (!await deleteFileOrDir(fullPath)) {
        failed.push(file);
      }
    }
    res.json({ ok: true, failed });
  } catch (error: any) {
    console.error('删除文件时出错:', error);
    res.status(500).json({ error: error.message });
  }
});

// 暂存选中的未暂存文件
app.post('/api/local-stage-files', async (req: Request, res: Response) => {
  try {
    const { dirPath, selectedFiles } = req.body;
    if (!dirPath || !selectedFiles || selectedFiles.length === 0) {
      return res.status(400).json({ error: '缺少参数或未选择文件' });
    }
    const git = getGit(dirPath);
    // 批量处理，避免 Windows 命令行长度限制
    const BATCH_SIZE = 100;
    for (let i = 0; i < selectedFiles.length; i += BATCH_SIZE) {
      const batch = selectedFiles.slice(i, i + BATCH_SIZE);
      await git.raw(['add', ...batch]);
    }
    res.json({ ok: true });
  } catch (error: any) {
    console.error('暂存文件时出错:', error);
    res.status(500).json({ error: error.message });
  }
});

// 取消暂存选中的已暂存文件
app.post('/api/local-unstage-files', async (req: Request, res: Response) => {
  try {
    const { dirPath, selectedFiles } = req.body;
    if (!dirPath || !selectedFiles || selectedFiles.length === 0) {
      return res.status(400).json({ error: '缺少参数或未选择文件' });
    }
    const git = getGit(dirPath);
    // 批量处理，避免 Windows 命令行长度限制
    const BATCH_SIZE = 100;
    for (let i = 0; i < selectedFiles.length; i += BATCH_SIZE) {
      const batch = selectedFiles.slice(i, i + BATCH_SIZE);
      await git.raw(['restore', '--staged', '--', ...batch]);
    }
    res.json({ ok: true });
  } catch (error: any) {
    console.error('取消暂存时出错:', error);
    res.status(500).json({ error: error.message });
  }
});

// 读取当前索引里的「已暂存」条目（-z：NUL 分隔，git 不对路径做引号/八进制转义）。
// 重命名/复制在 -z 下会紧跟一个裸路径条目作为「原路径」，这里把它一并读出，
// 供「只重置未勾选条目」时判定重命名「删旧」半边的去留。
async function getStagedEntries(
  git: ReturnType<typeof getGit>,
): Promise<{ newPath: string; oldPath: string | null; status: string }[]> {
  const raw = await git.raw(['status', '--porcelain', '-z']);
  const entries = raw.split('\0');
  if (entries.length > 0 && entries[entries.length - 1] === '') entries.pop();
  const result: { newPath: string; oldPath: string | null; status: string }[] = [];
  for (let n = 0; n < entries.length; n++) {
    const entry = entries[n];
    if (!entry || entry.length < 3) continue;
    const idx = entry[0];
    const wd = entry[1];
    const filePath = entry.slice(3);
    let oldPath: string | null = null;
    // -z 模式：重命名/复制时，当前条目是【新路径】，紧随其后的条目是【原路径】，需消费掉
    if (idx === 'R' || idx === 'C' || wd === 'R' || wd === 'C') {
      const next = entries[n + 1] ?? '';
      oldPath = next ? next.replace(/\/$/, '') : null;
      n++;
    }
    if (idx !== ' ' && idx !== '?' && idx !== '!') {
      result.push({ newPath: filePath.replace(/\/$/, ''), oldPath, status: idx });
    }
  }
  return result;
}

// 提交前过滤「真正可提交」的勾选文件，避免把无法提交的路径交给 git add（会 pathspec 报错 → 500）。
// - 工作区存在该路径 → 保留（新增 / 修改 / 已暂存的修改）；
// - 工作区不存在 → 若 HEAD 中仍存在该路径，说明是「已暂存的删除」，必须保留（否则删不掉）；
//   否则（如 AD：先 git add、随后又删掉工作区文件）该路径既不在工作区也不在 HEAD，
//   无法提交 → 归入 skipped 友好跳过。
// 性能：只有工作区不存在的文件才会触发额外的 git 调用，正常提交几乎零额外开销。
async function resolveCommitFiles(
  git: ReturnType<typeof getGit>,
  dirPath: string,
  selectedFiles: string[],
): Promise<{ keep: string[]; skipped: string[] }> {
  const keep: string[] = [];
  const skipped: string[] = [];
  for (const file of selectedFiles) {
    if (fs.existsSync(path.join(dirPath, file))) {
      keep.push(file);
      continue;
    }
    let inHead = false;
    try {
      await git.raw(['cat-file', '-e', 'HEAD:' + file]);
      inHead = true;
    } catch (_) {
      inHead = false;
    }
    if (inHead) {
      keep.push(file);
    } else {
      skipped.push(file);
    }
  }
  return { keep, skipped };
}

// 只把「未勾选」的已暂存条目从索引里移除——绝不清空整个索引。
// 必须按【条目】处理：重命名在索引里是「删旧 + 加新」两个条目，而 /api/local-status 只暴露新路径。
// 若整清索引，勾选的重命名会丢掉「删旧」半边（旧文件在提交里复活）；
// 若只按新路径 reset 未勾选的重命名，又会只删旧、不做新增（反向灾难）。
// 因此以「新路径是否被勾选」判定整个条目的去留：勾选条目的索引原样保留（重命名 / 部分暂存等状态不丢），
// 仅对未勾选条目做 path-limited 的 `reset --mixed -- <paths>`（分批，规避 Windows 命令行长度上限）。
async function unstageEntriesNotSelected(
  git: ReturnType<typeof getGit>,
  keep: string[],
  stagedEntries: { newPath: string; oldPath: string | null; status: string }[],
): Promise<void> {
  const keepSet = new Set(keep.map((p) => p.replace(/\/$/, '')));
  const resetPaths: string[] = [];
  const seen = new Set<string>();
  for (const e of stagedEntries) {
    if (keepSet.has(e.newPath)) continue; // 该条目被勾选 → 索引条目完全保留
    const candidates = e.oldPath ? [e.newPath, e.oldPath] : [e.newPath];
    for (const p of candidates) {
      if (!seen.has(p)) {
        seen.add(p);
        resetPaths.push(p);
      }
    }
  }
  const BATCH_SIZE = 100;
  for (let i = 0; i < resetPaths.length; i += BATCH_SIZE) {
    await git.raw(['reset', '--mixed', '--', ...resetPaths.slice(i, i + BATCH_SIZE)]);
  }
}

// 两个提交端点共用的「准备」逻辑：过滤 → (无可提交内容则返回 ok=false) → 只重置未勾选条目 → 分批 add 勾选文件。
// ok=false 时不触碰索引（先过滤、后动索引），由调用方返回 400。
async function prepareCommit(
  git: ReturnType<typeof getGit>,
  dirPath: string,
  selectedFiles: string[],
): Promise<{ ok: false } | { ok: true; skipped: string[] }> {
  const { keep, skipped } = await resolveCommitFiles(git, dirPath, selectedFiles);
  if (keep.length === 0) return { ok: false };
  const stagedEntries = await getStagedEntries(git);
  await unstageEntriesNotSelected(git, keep, stagedEntries);
  // 只跳过「真正的工作区删除」：索引状态 D 仅表示「相对 HEAD 是删除」，并不代表工作区里没有该文件。
  // 反例：`git rm p.txt` 后又重建 p.txt —— porcelain 会同时给出 `D  p.txt` 与 `?? p.txt`，
  // 此时工作区存在 p.txt（应当提交其最新内容）；若只按 status==='D' 跳过 add，
  // 重建出来的内容就会被漏掉（HEAD 仍是删除，工作区残留 `?? p.txt`）。
  // 因此这里必须同时满足「索引 D」且「工作区确实不存在」，才从 add 列表剔除。
  // （工作区确实不存在且索引无该条目时，再 add 会报 "pathspec did not match any files"；
  //   而这类已暂存的删除本就无需再动。）
  const stagedDeleted = new Set(
    stagedEntries
      .filter((e) => e.status === 'D' && !fs.existsSync(path.join(dirPath, e.newPath)))
      .map((e) => e.newPath),
  );
  const addPaths = keep.filter((p) => !stagedDeleted.has(p.replace(/\/$/, '')));
  const BATCH_SIZE = 100;
  for (let i = 0; i < addPaths.length; i += BATCH_SIZE) {
    await git.add(addPaths.slice(i, i + BATCH_SIZE));
  }
  return { ok: true, skipped };
}

// 本地提交（仅提交选中的文件）
app.post('/api/local-commit', async (req: Request, res: Response) => {
  try {
    const { dirPath, message, selectedFiles } = req.body;
    if (!dirPath || !message) {
      return res.status(400).json({ error: '缺少参数' });
    }
    if (!selectedFiles || selectedFiles.length === 0) {
      return res.status(400).json({ error: '请选择要提交的文件' });
    }
    const git = getGit(dirPath);
    const prep = await prepareCommit(git, dirPath, selectedFiles);
    if (!prep.ok) {
      return res.status(400).json({ error: '选中的文件没有可提交的改动' });
    }
    await git.commit(message);
    res.json({ ok: true, skipped: prep.skipped });
  } catch (error: any) {
    console.error('提交时出错:', error);
    res.status(500).json({ error: error.message });
  }
});

// 本地提交并推送（仅提交选中的文件）
app.post('/api/local-commit-push', async (req: Request, res: Response) => {
  try {
    const { dirPath, message, selectedFiles } = req.body;
    if (!dirPath || !message) {
      return res.status(400).json({ error: '缺少参数' });
    }
    if (!selectedFiles || selectedFiles.length === 0) {
      return res.status(400).json({ error: '请选择要提交的文件' });
    }
    const git = getGit(dirPath);
    // 与 /api/local-commit 完全一致：走同一个 prepareCommit（过滤 → 只重置未勾选条目 → add 勾选）。
    const prep = await prepareCommit(git, dirPath, selectedFiles);
    if (!prep.ok) {
      return res.status(400).json({ error: '选中的文件没有可提交的改动' });
    }
    await git.commit(message);
    const branch = (await git.branchLocal()).current;
    await git.push('origin', branch);
    res.json({ ok: true, branch, skipped: prep.skipped });
  } catch (error: any) {
    console.error('提交并推送时出错:', error);
    const remoteDirPath = req.body.dirPath;
    let remoteUrl = '';
    if (remoteDirPath) {
      try {
        const remotes = await getGit(remoteDirPath).getRemotes(true);
        if (remotes.length > 0) remoteUrl = remotes[0].refs.push || remotes[0].refs.fetch || '';
      } catch (_) {}
    }
    const prefix = remoteUrl ? `远程仓库链接失败: ${remoteUrl} ` : '';
    res.status(500).json({ error: `${prefix}${error.message}` });
  }
});

const DATA_FILE = path.join(__dirname, 'state.json');

// 保存上次检查的路径
app.post('/api/save-last-path', (req: Request, res: Response) => {
  try {
    const { dirPath } = req.body;
    let data: Record<string, any> = {};
    try {
      data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    } catch (_) { /* ignore */ }
    data.lastPath = dirPath;
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 读取上次检查的路径
app.get('/api/last-path', (req: Request, res: Response) => {
  try {
    let data: Record<string, any> = {};
    try {
      data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    } catch (_) { /* ignore */ }
    res.json({ lastPath: data.lastPath || null });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 保存 UI 状态（刷新保持）
const UI_DEFAULTS = { activeTab: 'commits', sidebarWidth: 260, lang: 'zh' };

app.get('/api/ui-state', (req: Request, res: Response) => {
  try {
    let data: Record<string, any> = {};
    try {
      data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    } catch (_) { /* ignore */ }
    res.json({ ...UI_DEFAULTS, ...data.uiState });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/ui-state', (req: Request, res: Response) => {
  try {
    let data: Record<string, any> = {};
    try {
      data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    } catch (_) { /* ignore */ }
    data.uiState = { ...UI_DEFAULTS, ...data.uiState, ...req.body };
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// SSE: 文件变更事件推送
const fileEventWatchers: Record<string, {
  watcher: fs.FSWatcher | null;
  connections: Set<Response>;
  timer: NodeJS.Timeout | null;
}> = {};

app.get('/api/file-events', (req: Request, res: Response) => {
  const dirPath = req.query.dirPath as string;
  if (!dirPath) return res.status(400).end();

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  (req.socket as any).setTimeout(0);
  (req.socket as any).setNoDelay(true);

  if (!fileEventWatchers[dirPath]) {
    fileEventWatchers[dirPath] = { watcher: null, connections: new Set(), timer: null };
    try {
      const watcher = fs.watch(dirPath, { recursive: true });
      watcher.on('change', (eventType: string, filename: string | null) => {
        const relPath = filename ? filename.replace(/\\/g, '/') : '';
        if (relPath.startsWith('.git')) return;
        clearTimeout(fileEventWatchers[dirPath].timer!);
        fileEventWatchers[dirPath].timer = setTimeout(() => {
          const msg = JSON.stringify({ type: 'file-change' });
          for (const conn of fileEventWatchers[dirPath].connections) {
            conn.write(`data: ${msg}\n\n`);
          }
        }, 1000);
      });
      fileEventWatchers[dirPath].watcher = watcher;
    } catch (_) {
      delete fileEventWatchers[dirPath];
    }
  }

  if (fileEventWatchers[dirPath]) {
    fileEventWatchers[dirPath].connections.add(res);
  }

  const keepAlive = setInterval(() => {
    res.write(':keepalive\n\n');
  }, 30000);

  req.on('close', () => {
    clearInterval(keepAlive);
    if (fileEventWatchers[dirPath]) {
      fileEventWatchers[dirPath].connections.delete(res);
      if (fileEventWatchers[dirPath].connections.size === 0) {
        try { fileEventWatchers[dirPath].watcher!.close(); } catch (_) {}
        delete fileEventWatchers[dirPath];
      }
    }
  });
});

const publicDir = path.join(__dirname, 'public');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
  app.get('/{*path}', (req, res) => {
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.sendFile(path.join(publicDir, 'index.html'));
  });
}

app.listen(Number(PORT), () => {
  console.log(`服务器启动成功`);
});
