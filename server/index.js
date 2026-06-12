const express = require('express');
const cors = require('cors');
const simpleGit = require('simple-git');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

function getGit(dirPath) {
  return simpleGit(dirPath);
}

// 检查目录是否为Git仓库并获取分支信息
app.post('/api/check-git', async (req, res) => {
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
    const [localBranches, remoteBranches] = await Promise.all([
      git.branchLocal(),
      git.branch(['-r'])
    ]);

    res.json({
      isGitRepo: true,
      path: dirPath,
      currentBranch: localBranches.current,
      localBranches: localBranches.all,
      remoteBranches: remoteBranches.all,
      message: 'Git仓库分析完成'
    });

  } catch (error) {
    console.error('分析Git仓库时出错:', error);
    res.status(500).json({ error: '分析Git仓库时出错: ' + error.message });
  }
});

// 获取所有盘符（Windows）
app.get('/api/drives', (req, res) => {
  try {
    const drives = [];
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
  } catch (error) {
    console.error('获取盘符时出错:', error);
    res.status(500).json({ error: '获取盘符时出错' });
  }
});

// 获取目录列表
app.post('/api/list-directory', (req, res) => {
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

  } catch (error) {
    console.error('列出目录时出错:', error);
    res.status(500).json({ error: '列出目录时出错: ' + error.message });
  }
});

// 迁出指定分支
app.post('/api/checkout', async (req, res) => {
  try {
    const { dirPath, branch } = req.body;
    if (!dirPath || !branch) {
      return res.status(400).json({ error: '缺少参数' });
    }
    const git = getGit(dirPath);
    await git.checkout(branch);
    res.json({ ok: true, branch });
  } catch (error) {
    console.error('迁出分支时出错:', error);
    res.status(500).json({ error: error.message });
  }
});

// 获取commit日志（分页）
app.post('/api/commits', async (req, res) => {
  try {
    const { dirPath, branch, page = 1, pageSize = 50 } = req.body;
    if (!dirPath || !branch) {
      return res.status(400).json({ error: '缺少参数' });
    }
    const git = getGit(dirPath);
    const skip = (page - 1) * pageSize;
    const [raw, totalRaw] = await Promise.all([
      git.raw(['log', branch, `--skip=${skip}`, `--max-count=${pageSize}`, '--format=%H||%an||%ae||%ai||%s']),
      git.raw(['rev-list', '--count', branch])
    ]);
    const commits = raw.trim().split('\n').filter(Boolean).map(line => {
      const [hash, author, email, date, ...msgParts] = line.split('||');
      return { hash, author, email, date, message: msgParts.join('||') };
    });
    res.json({ branch, commits, totalCount: parseInt(totalRaw.trim(), 10) || 0, page, pageSize });
  } catch (error) {
    console.error('获取commit日志时出错:', error);
    res.status(500).json({ error: error.message });
  }
});

// 从指定源分支创建新分支
app.post('/api/create-branch', async (req, res) => {
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
  } catch (error) {
    console.error('创建分支时出错:', error);
    res.status(500).json({ error: error.message });
  }
});

// 合并分支到当前分支
app.post('/api/merge-branch', async (req, res) => {
  try {
    const { dirPath, sourceBranch } = req.body;
    if (!dirPath || !sourceBranch) {
      return res.status(400).json({ error: '缺少参数' });
    }
    const git = getGit(dirPath);
    await git.raw(['merge', sourceBranch]);
    res.json({ ok: true });
  } catch (error) {
    console.error('合并分支时出错:', error);
    res.status(500).json({ error: error.message });
  }
});

// 重命名分支
app.post('/api/rename-branch', async (req, res) => {
  try {
    const { dirPath, oldName, newName } = req.body;
    if (!dirPath || !oldName || !newName) {
      return res.status(400).json({ error: '缺少参数' });
    }
    const git = getGit(dirPath);
    await git.branch(['-m', oldName, newName]);
    res.json({ ok: true, branch: newName });
  } catch (error) {
    console.error('重命名分支时出错:', error);
    res.status(500).json({ error: error.message });
  }
});

// 删除分支
app.post('/api/delete-branch', async (req, res) => {
  try {
    const { dirPath, branch } = req.body;
    if (!dirPath || !branch) {
      return res.status(400).json({ error: '缺少参数' });
    }
    const git = getGit(dirPath);
    await git.branch(['-d', branch]);
    res.json({ ok: true });
  } catch (error) {
    console.error('删除分支时出错:', error);
    res.status(500).json({ error: error.message });
  }
});

// 推送分支
app.post('/api/push', async (req, res) => {
  try {
    const { dirPath, branch } = req.body;
    if (!dirPath || !branch) {
      return res.status(400).json({ error: '缺少参数' });
    }
    const git = getGit(dirPath);
    await git.push('origin', branch);
    res.json({ ok: true });
  } catch (error) {
    console.error('推送分支时出错:', error);
    res.status(500).json({ error: error.message });
  }
});

// 拉取更新（fetch --all）
app.post('/api/fetch', async (req, res) => {
  try {
    const { dirPath } = req.body;
    if (!dirPath) {
      return res.status(400).json({ error: '缺少参数' });
    }
    const git = getGit(dirPath);
    await git.fetch(['--all']);
    res.json({ ok: true });
  } catch (error) {
    console.error('拉取更新时出错:', error);
    res.status(500).json({ error: error.message });
  }
});

// 比较两个分支的commit差异（双向）
app.post('/api/compare-branches', async (req, res) => {
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
    const parse = (raw) => raw.trim().split('\n').filter(Boolean).map(line => {
      const [hash, ...msgParts] = line.split(' ');
      return { hash, message: msgParts.join(' ') };
    });
    const compareCount = parseInt(compareCountRaw.trim(), 10) || 0;
    const baseCount = parseInt(baseCountRaw.trim(), 10) || 0;
    res.json({ compareAhead: parse(compareAheadRaw), compareAheadTotal: compareCount, baseAhead: parse(baseAheadRaw), baseAheadTotal: baseCount });
  } catch (error) {
    console.error('比较分支时出错:', error);
    res.status(500).json({ error: error.message });
  }
});

// 变基当前分支到目标分支
app.post('/api/rebase-branch', async (req, res) => {
  try {
    const { dirPath, targetBranch } = req.body;
    if (!dirPath || !targetBranch) {
      return res.status(400).json({ error: '缺少参数' });
    }
    const git = getGit(dirPath);
    await git.raw(['rebase', targetBranch]);
    res.json({ ok: true });
  } catch (error) {
    console.error('变基分支时出错:', error);
    res.status(500).json({ error: error.message });
  }
});

// 获取单个commit的diff
app.post('/api/commit-diff', async (req, res) => {
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
  } catch (error) {
    console.error('获取diff时出错:', error);
    res.status(500).json({ error: error.message });
  }
});

// 获取某次 commit 修改的文件列表
app.post('/api/commit-files', async (req, res) => {
  try {
    const { dirPath, commitHash } = req.body;
    if (!dirPath || !commitHash) {
      return res.status(400).json({ error: '缺少参数' });
    }
    const git = getGit(dirPath);
    const raw = await git.raw(['diff-tree', '--no-commit-id', '-r', '--name-status', commitHash]);
    const files = raw.trim().split('\n').filter(Boolean).map(line => {
      const [status, ...fileParts] = line.split('\t');
      return { status, filePath: fileParts.join('\t') };
    });
    res.json({ commitHash, files });
  } catch (error) {
    console.error('获取commit文件列表时出错:', error);
    res.status(500).json({ error: error.message });
  }
});

// 获取某次 commit 中某个文件的 diff
app.post('/api/commit-file-diff', async (req, res) => {
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
  } catch (error) {
    console.error('获取文件diff时出错:', error);
    res.status(500).json({ error: error.message });
  }
});

const DATA_FILE = path.join(__dirname, 'opencode.json');

// 保存上次检查的路径
app.post('/api/save-last-path', (req, res) => {
  try {
    const { dirPath } = req.body;
    let data = {};
    try {
      data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    } catch (_) { /* ignore */ }
    data.lastPath = dirPath;
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 读取上次检查的路径
app.get('/api/last-path', (req, res) => {
  try {
    let data = {};
    try {
      data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    } catch (_) { /* ignore */ }
    res.json({ lastPath: data.lastPath || null });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`服务器启动成功`);
});