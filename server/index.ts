import express, { Request, Response } from 'express';
import cors from 'cors';
import simpleGit from 'simple-git';
import path from 'path';
import fs from 'fs';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

function getGit(dirPath: string) {
  return simpleGit(dirPath);
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

// 获取提交历史分支图
app.post('/api/commit-graph', async (req: Request, res: Response) => {
  try {
    const { dirPath, page = 1, pageSize = 50, branch } = req.body;
    if (!dirPath) return res.status(400).json({ error: '缺少参数' });
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
      return res.json({ rows: [], total, page, pageSize });
    }

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
    res.json({ rows: finalRows, total, page, pageSize });
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
    const { dirPath, branch } = req.body;
    if (!dirPath || !branch) {
      return res.status(400).json({ error: '缺少参数' });
    }
    const git = getGit(dirPath);
    await git.branch(['-d', branch]);
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
      if (!type) type = 'merge';
      try {
        if (type === 'merge') {
          const mergeMsg = await fs.promises.readFile(path.join(gitDir, 'MERGE_MSG'), 'utf-8');
          const m = mergeMsg.match(/^Merge branch ['"]([^'"]+)/);
          if (m) theirsBranch = m[1];
        } else {
          const headRef = await fs.promises.readFile(path.join(gitDir, 'rebase-merge', 'head-name'), 'utf-8');
          theirsBranch = headRef.trim().replace('refs/heads/', '');
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
    try { ours = await git.raw(['show', ':2:' + filePath]); } catch (_) { ours = ''; }
    try { theirs = await git.raw(['show', ':3:' + filePath]); } catch (_) { theirs = ''; }
    const hunks: HunkInfo[] = [];
    try {
      const diff = await git.raw(['diff', '--unified=0', `:2:${filePath}`, `:3:${filePath}`]);
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
    try {
      await git.raw(['merge', '--abort']);
    } catch (_) {
      await git.raw(['rebase', '--abort']);
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
    try { await fs.promises.access(path.join(gitDir, 'MERGE_HEAD')); isMerge = true; } catch (_) {}
    if (isMerge) {
      await git.raw(['commit', '--no-edit']);
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
    const raw = await git.raw(['status', '--porcelain']);
    const staged: StatusEntry[] = [];
    const unstaged: StatusEntry[] = [];
    const lines = raw.split('\n').map(l => l.replace(/\r$/, '')).filter(l => l.length >= 3);
    for (const line of lines) {
      const idx = line[0];
      const wd = line[1];
      const filePath = line.slice(3);
      if (filePath.endsWith('/')) continue;
      if (idx === 'U' || wd === 'U') continue;
      if (idx !== ' ' && idx !== '?' && idx !== '!') {
        staged.push({ path: filePath, status: idx === 'M' ? 'modified' : idx === 'A' ? 'added' : idx === 'D' ? 'deleted' : idx === 'R' ? 'renamed' : idx });
      }
      if (idx === '?' && wd === '?') {
        unstaged.push({ path: filePath, status: 'untracked' });
      } else if (wd !== ' ' && idx !== '?') {
        unstaged.push({ path: filePath, status: wd === 'M' ? 'modified' : wd === 'D' ? 'deleted' : wd });
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
    const git = getGit(dirPath);
    const args = ['diff', '--no-color'];
    if (type === 'staged') args.push('--cached');
    args.push('--', filePath);
    const diffOutput = await git.raw(args);
    const rows = parseDiff(diffOutput);
    res.json({ filePath, type, rows });
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
    const failed: string[] = [];
    for (const file of selectedFiles) {
      try {
        await git.checkout(['--', file]);
      } catch (e) {
        failed.push(file);
      }
    }
    res.json({ ok: true, failed });
  } catch (error: any) {
    console.error('回退文件时出错:', error);
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
    for (const file of selectedFiles) {
      await git.raw(['add', file]);
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
    for (const file of selectedFiles) {
      await git.raw(['restore', '--staged', file]);
    }
    res.json({ ok: true });
  } catch (error: any) {
    console.error('取消暂存时出错:', error);
    res.status(500).json({ error: error.message });
  }
});

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
    await git.reset();
    for (const file of selectedFiles) {
      await git.add(file);
    }
    await git.commit(message);
    res.json({ ok: true });
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
    await git.reset();
    for (const file of selectedFiles) {
      await git.add(file);
    }
    await git.commit(message);
    const branch = (await git.branchLocal()).current;
    await git.push('origin', branch);
    res.json({ ok: true, branch });
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

app.listen(Number(PORT), () => {
  console.log(`服务器启动成功`);
});
