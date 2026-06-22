import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from './i18n';
import Swal from 'sweetalert2';
import { API_BASE_URL } from './constants';
import {
  fetchDrives, fetchDirectories, checkGit,
  fetchCommitGraph,
  saveLastPath, getLastPath,
  checkoutBranch, createBranch, mergeBranch, renameBranch,
  deleteBranch, pushBranch, fetchAll, compareBranches, getCommitDiff, rebaseBranch,
  fetchCommitFiles, fetchCommitFileDiff,
  fetchLocalStatus, fetchLocalFileDiff, commitChanges,
  stageFiles, restoreFile, fetchUiState, saveUiState, fetchPendingCommits,
  unstageFiles,
  fetchConflictFiles, continueMerge,
  cherryPickCommit, revertCommit
} from './api';
import BranchList from './components/BranchList';
import ContextMenu from './components/ContextMenu';
import ConflictResolver from './components/ConflictResolver';
import './GitVisualizer.css';

interface GitInfo {
  isGitRepo: boolean;
  path: string;
  currentBranch: string;
  localBranches: { name: string; ahead: number; behind: number }[];
  remoteBranches: string[];
  message: string;
}

interface GraphCommit {
  hash: string;
  parents: string;
  message: string;
  author: string;
  date: string;
  refs: string;
  isOnHeadBranch: boolean;
  needsPush: boolean;
}

interface GraphRow {
  graph: string;
  commit: GraphCommit | null;
}

interface LocalStatusEntry {
  path: string;
  status: string;
}

interface LocalStatus {
  staged: LocalStatusEntry[];
  unstaged: LocalStatusEntry[];
}

interface DiffRow {
  oldLine: number | null;
  oldContent: string | null;
  oldType: string | null;
  newLine: number | null;
  newContent: string | null;
  newType: string | null;
}

interface CompareData {
  compareBranch: string;
  baseBranch: string;
  compareAhead: { hash: string; message: string }[];
  compareAheadTotal: number;
  baseAhead: { hash: string; message: string }[];
  baseAheadTotal: number;
}

interface ContextMenuState {
  x: number;
  y: number;
  items: { label: string; onClick: () => void; danger?: boolean; disabled?: boolean }[];
}

interface CommitFileEntry {
  status: string;
  filePath: string;
}

function GitVisualizer() {
  const { t } = useTranslation();
  const [view, setView] = useState<'select' | 'analyze'>('select');
  const [currentPath, setCurrentPath] = useState('');
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [directories, setDirectories] = useState<{ name: string; path: string }[]>([]);
  const [drives, setDrives] = useState<{ name: string; path: string }[]>([]);
  const [showDrives, setShowDrives] = useState(true);
  const [inputPath, setInputPath] = useState('');
  const [gitInfo, setGitInfo] = useState<GitInfo | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [commitsTotal, setCommitsTotal] = useState(0);
  const [commitPage, setCommitPage] = useState(1);
  const [commitPageSize, setCommitPageSize] = useState(50);
  const [graphRows, setGraphRows] = useState<GraphRow[]>([]);
  const [headHash, setHeadHash] = useState('');
  const [graphLoading, setGraphLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [initialLoading, setInitialLoading] = useState(true);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [activeTab, setActiveTab] = useState('commits');
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(260);
  const [compareData, setCompareData] = useState<CompareData | null>(null);
  const [selectedDiffCommit, setSelectedDiffCommit] = useState<string | null>(null);
  const [diffContent, setDiffContent] = useState('');
  const [diffMeta, setDiffMeta] = useState<{ hash: string; message: string; author: string; date: string } | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [expandedCommit, setExpandedCommit] = useState<string | null>(null);
  const [commitFiles, setCommitFiles] = useState<CommitFileEntry[] | null>(null);
  const [commitFilesLoading, setCommitFilesLoading] = useState(false);
  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  const [fileDiff, setFileDiff] = useState('');
  const [fileDiffLoading, setFileDiffLoading] = useState(false);
  const [localStatus, setLocalStatus] = useState<LocalStatus | null>(null);
  const [localStatusLoading, setLocalStatusLoading] = useState(false);
  const [selectedLocalFile, setSelectedLocalFile] = useState<string | null>(null);
  const [selectedLocalFileType, setSelectedLocalFileType] = useState<string | null>(null);
  const [localFileDiff, setLocalFileDiff] = useState<DiffRow[]>([]);
  const [localFileDiffLoading, setLocalFileDiffLoading] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');
  const [commitLoading, setCommitLoading] = useState(false);
  const [stageLoading, setStageLoading] = useState(false);
  const [unstageLoading, setUnstageLoading] = useState(false);
  const [selectedStagedFiles, setSelectedStagedFiles] = useState<Record<string, boolean>>({});
  const [selectedUnstagedFiles, setSelectedUnstagedFiles] = useState<Record<string, boolean>>({});
  const [theme, setTheme] = useState('light');
  const [conflictFiles, setConflictFiles] = useState<string[] | null>(null);
  const [conflictType, setConflictType] = useState<string | null>(null);
  const [conflictTheirsBranch, setConflictTheirsBranch] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setInitialLoading(true);
      await handleLoadDrives();
      try {
        const urlDir = new URLSearchParams(window.location.search).get('dir');
        const dirPath = urlDir || await getLastPath();
        if (dirPath) {
          await handleLoadDirectories(dirPath);
          await handleDoCheckGit(dirPath);
        }
      } catch (_) { /* ignore */ }
      setInitialLoading(false);
    })();
    fetchUiState().then((s: any) => {
      if (s.activeTab) setActiveTab(s.activeTab);
      if (typeof s.sidebarWidth === 'number') setSidebarWidth(s.sidebarWidth);
      if (s.lang && s.lang !== i18n.language) i18n.changeLanguage(s.lang);
      if (s.theme) setTheme(s.theme);
    }).catch(() => {});
  }, []);

  const saveUiStateDebounced = useRef<ReturnType<typeof setTimeout> | null>(null);

  const queueSaveUiState = useCallback((partial: Record<string, any>) => {
    if (saveUiStateDebounced.current) clearTimeout(saveUiStateDebounced.current);
    saveUiStateDebounced.current = setTimeout(() => saveUiState(partial), 300);
  }, []);

  useEffect(() => { queueSaveUiState({ activeTab }); }, [activeTab, queueSaveUiState]);
  useEffect(() => { queueSaveUiState({ sidebarWidth }); }, [sidebarWidth, queueSaveUiState]);
  useEffect(() => { queueSaveUiState({ theme }); }, [theme, queueSaveUiState]);
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);

  const handleLoadDrives = async () => {
    try {
      const data = await fetchDrives();
      setDrives(data.drives);
      setShowDrives(true);
      setCurrentPath('');
      setParentPath(null);
      setDirectories([]);
      setGitInfo(null);
      setError('');
    } catch (err: any) {
      setError(t('error.loadDrives', { msg: err.response?.data?.error || err.message }));
    }
  };

  const handleLoadDirectories = async (dirPath: string) => {
    try {
      setLoading(true);
      const data = await fetchDirectories(dirPath);
      setDirectories(data.directories);
      setParentPath(data.parentPath);
      setCurrentPath(data.currentPath);
      setShowDrives(false);
      setGitInfo(null);
      setError('');
    } catch (err: any) {
      setError(t('error.loadDirectories', { msg: err.response?.data?.error || err.message }));
    } finally {
      setLoading(false);
    }
  };

  const handleDriveClick = (drivePath: string) => handleLoadDirectories(drivePath);
  const handleDirectoryClick = (dirPath: string) => handleLoadDirectories(dirPath);

  const handleParentClick = () => {
    if (parentPath) handleLoadDirectories(parentPath);
  };

  const handleGoPath = () => {
    const trimmed = inputPath.trim();
    if (trimmed) handleLoadDirectories(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleGoPath();
  };

  const handleDoCheckGit = async (dirPath: string) => {
    try {
      setLoading(true);
      const data = await checkGit(dirPath);
      setGitInfo(data);
      setError('');

      if (data.isGitRepo) {
        saveLastPath(dirPath);
        const url = new URL(window.location.href);
        url.searchParams.set('dir', dirPath);
        window.history.replaceState({}, '', url.toString());
        const dirName = dirPath.split(/[/\\]/).filter(Boolean).pop();
        document.title = `Git 仓库可视化工具 - ${dirName || dirPath}`;
        setSelectedBranch(data.currentBranch);
        setView('analyze');
      }
    } catch (err: any) {
      setError(t('error.checkGit', { msg: err.response?.data?.error || err.message }));
    } finally {
      setLoading(false);
    }
  };

  const handleCheckGit = () => handleDoCheckGit(currentPath);

  const handleLoadGraph = async (page = 1, pageSize = commitPageSize, branch?: string) => {
    setGraphLoading(true);
    try {
      const data = await fetchCommitGraph(currentPath, page, pageSize, branch);
      setGraphRows(data.rows);
      setCommitsTotal(data.total);
      setCommitPage(page);
      if (data.headHash) setHeadHash(data.headHash);
    } catch (_) {
      setGraphRows([]);
      setCommitsTotal(0);
    } finally {
      setGraphLoading(false);
    }
  };

  const totalCommitPages = commitPageSize > 0 ? Math.ceil(commitsTotal / commitPageSize) || 1 : 1;

  const handlePrevPage = () => {
    if (commitPage > 1) handleLoadGraph(commitPage - 1);
  };

  const handleNextPage = () => {
    if (commitPage < totalCommitPages) handleLoadGraph(commitPage + 1);
  };

  const [commitPageInput, setCommitPageInput] = useState('');

  const handleGoToPage = () => {
    const p = parseInt(commitPageInput, 10);
    if (p >= 1 && p <= totalCommitPages) {
      handleLoadGraph(p);
      setCommitPageInput('');
    }
  };

  const handlePageSizeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = parseInt(e.target.value, 10);
    setCommitPageSize(v);
    handleLoadGraph(1, v);
  };

  const handleBranchSelect = (branch: string) => {
    setSelectedBranch(branch);
  };

  const handleBranchDoubleClick = (branch: string) => {
    setSelectedBranch(branch);
    setActiveTab('commits');
  };

  const handleShowAllBranches = () => {
    setSelectedBranch(null);
    handleLoadGraph(1, commitPageSize, undefined);
  };

  const handleReselect = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('dir');
    window.history.replaceState({}, '', url.toString());
    document.title = 'Git 仓库可视化工具';
    setView('select');
  };

  const handleCloseContextMenu = () => {
    setContextMenu(null);
  };

  const handleAbortConflict = async () => {
    setConflictFiles(null);
    setConflictType(null);
    setConflictTheirsBranch(null);
    const data = await handleRefreshGitInfo();
    setSelectedBranch(data.currentBranch);
    setActiveTab('commits');
  };

  const handleConflictResolved = async () => {
    try {
      const { files, type, theirsBranch } = await fetchConflictFiles(currentPath);
      if (files && files.length > 0) {
        setConflictFiles(files);
        setConflictType(type || 'merge');
        setConflictTheirsBranch(theirsBranch || null);
      } else {
        await continueMerge(currentPath);
        setConflictFiles(null);
        setConflictType(null);
        setConflictTheirsBranch(null);
        const data = await handleRefreshGitInfo();
        setSelectedBranch(data.currentBranch);
        setActiveTab('commits');
      }
    } catch (_) {}
  };

  const handleRefreshGitInfo = async (): Promise<GitInfo> => {
    const data = await checkGit(currentPath);
    setGitInfo(data);
    return data;
  };

  const handleCheckoutBranch = async (branch: string) => {
    try {
      await checkoutBranch(currentPath, branch);
      const data = await handleRefreshGitInfo();
      setSelectedBranch(data.currentBranch);
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message;
      if (msg.includes('would be overwritten by checkout')) {
        Swal.fire({ icon: 'error', title: i18n.t('dialog.checkoutFail'), text: i18n.t('dialog.checkoutConflict') });
      } else if (msg.includes('needs merge') || msg.includes('resolve your current index')) {
        Swal.fire({ icon: 'error', title: i18n.t('dialog.checkoutFail'), text: i18n.t('dialog.checkoutNeedsMerge') });
      } else {
        Swal.fire({ icon: 'error', title: i18n.t('dialog.checkoutFail'), text: msg });
      }
    }
  };

  const handleCreateBranch = async (sourceBranch: string) => {
    const { value: name } = await Swal.fire({
      title: i18n.t('dialog.createBranch.title'),
      input: 'text',
      inputPlaceholder: i18n.t('dialog.createBranch.placeholder'),
      showCancelButton: true,
      confirmButtonText: t('common.create'),
      cancelButtonText: t('common.cancel'),
      inputValidator: (value: string) => value ? null : i18n.t('dialog.createBranch.emptyError')
    });
    if (!name) return;
    setLoading(true);
    try {
      await createBranch(currentPath, name, sourceBranch);
      await handleRefreshGitInfo();
    } catch (err: any) {
      Swal.fire({ icon: 'error', title: i18n.t('dialog.createFail'), text: err.response?.data?.error || err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleMergeBranch = async (sourceBranch: string) => {
    const { isConfirmed } = await Swal.fire({
      title: i18n.t('dialog.merge.title'),
      text: i18n.t('dialog.merge.text', { source: sourceBranch, current: gitInfo?.currentBranch }),
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: t('common.confirm'),
      cancelButtonText: t('common.cancel')
    });
    if (!isConfirmed) return;
    try {
      const res = await mergeBranch(currentPath, sourceBranch);
      if (res.conflict) {
        setConflictFiles(res.files);
        setConflictType('merge');
        setConflictTheirsBranch(sourceBranch);
        setActiveTab('conflicts');
        return;
      }
      const data = await handleRefreshGitInfo();
      setSelectedBranch(data.currentBranch);
      await handleLoadGraph();
    } catch (err: any) {
      Swal.fire({ icon: 'error', title: i18n.t('dialog.mergeFail'), text: err.response?.data?.error || err.message });
    }
  };

  const handleRenameBranch = async (branch: string) => {
    const { value: newName } = await Swal.fire({
      title: i18n.t('dialog.rename.title'),
      input: 'text',
      inputValue: branch,
      showCancelButton: true,
      confirmButtonText: t('common.confirm'),
      cancelButtonText: t('common.cancel'),
      inputValidator: (value: string) => {
        if (!value) return i18n.t('dialog.rename.emptyError');
        if (value === branch) return i18n.t('dialog.rename.sameError');
      }
    });
    if (!newName) return;
    setLoading(true);
    try {
      await renameBranch(currentPath, branch, newName);
      const data = await handleRefreshGitInfo();
      if (selectedBranch === branch) {
        setSelectedBranch(newName);
      }
    } catch (err: any) {
      Swal.fire({ icon: 'error', title: i18n.t('dialog.renameFail'), text: err.response?.data?.error || err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteBranch = async (branch: string) => {
    const { isConfirmed } = await Swal.fire({
      title: i18n.t('dialog.delete.title'),
      text: i18n.t('dialog.delete.text', { branch }),
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: t('common.delete'),
      cancelButtonText: t('common.cancel'),
      confirmButtonColor: '#e74c3c'
    });
    if (!isConfirmed) return;
    setLoading(true);
    try {
      await deleteBranch(currentPath, branch);
      await handleRefreshGitInfo();
    } catch (err: any) {
      Swal.fire({ icon: 'error', title: i18n.t('dialog.deleteFail'), text: err.response?.data?.error || err.message });
    } finally {
      setLoading(false);
    }
  };

  const escapeHtml = (str: string) => {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  };

  const confirmPushDialog = async (branch: string) => {
    const { commits } = await fetchPendingCommits(currentPath, branch);
    if (!commits || commits.length === 0) {
      Swal.fire({ icon: 'info', title: t('local.pushNoPending'), timer: 1500, showConfirmButton: false });
      return null;
    }
    const rows = commits.map((c: { hash: string; message: string }) =>
      `<tr><td style="font-family:monospace;font-size:12px;padding:3px 8px;color:#666">${escapeHtml(c.hash.substring(0, 7))}</td><td style="padding:3px 8px">${escapeHtml(c.message)}</td></tr>`
    ).join('');
    const result = await Swal.fire({
      title: t('local.pushConfirmTitle', { branch }),
      html: `<div style="margin-bottom:8px;color:#888;font-size:13px">${t('local.pushConfirmCount', { count: commits.length })}</div><table style="width:100%;border-collapse:collapse;table-layout:fixed">${rows}</table>`,
      showCancelButton: true,
      confirmButtonText: t('local.pushConfirm'),
      cancelButtonText: t('common.cancel'),
    });
    return result.isConfirmed ? branch : null;
  };

  const handlePushBranch = async (branch: string) => {
    setLoading(true);
    try {
      const confirmed = await confirmPushDialog(branch);
      if (!confirmed) return;
      await pushBranch(currentPath, branch);
      Swal.fire({ icon: 'success', title: i18n.t('dialog.push.success', { branch }), timer: 2000, showConfirmButton: false });
      await handleRefreshGitInfo();
    } catch (err: any) {
      Swal.fire({ icon: 'error', title: i18n.t('dialog.push.fail'), text: err.response?.data?.error || err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleFetch = async () => {
    setLoading(true);
    try {
      await fetchAll(currentPath);
      await handleRefreshGitInfo();
      Swal.fire({ icon: 'success', title: i18n.t('dialog.fetch.success'), timer: 2000, showConfirmButton: false });
    } catch (err: any) {
      Swal.fire({ icon: 'error', title: i18n.t('dialog.fetch.fail'), text: err.response?.data?.error || err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleCompareBranches = async (compareBranch: string) => {
    setLoading(true);
    try {
      const data = await compareBranches(currentPath, gitInfo!.currentBranch, compareBranch);
      setCompareData({ ...data, compareBranch, baseBranch: gitInfo!.currentBranch });
      setActiveTab('compare');
      setSelectedDiffCommit(null);
      setDiffContent('');
      setDiffMeta(null);
    } catch (err: any) {
      Swal.fire({ icon: 'error', title: i18n.t('dialog.compareFail'), text: err.response?.data?.error || err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleLoadDiff = async (commitHash: string) => {
    if (selectedDiffCommit === commitHash) return;
    setSelectedDiffCommit(commitHash);
    setDiffLoading(true);
    try {
      const data = await getCommitDiff(currentPath, commitHash);
      setDiffMeta({ hash: data.commitHash, message: data.message, author: data.author, date: data.date });
      setDiffContent(data.diff);
    } catch (err: any) {
      Swal.fire({ icon: 'error', title: i18n.t('dialog.diffFail'), text: err.response?.data?.error || err.message });
    } finally {
      setDiffLoading(false);
    }
  };

  const handleRebaseBranch = async (targetBranch: string) => {
    const { isConfirmed } = await Swal.fire({
      title: i18n.t('dialog.rebase.title'),
      text: i18n.t('dialog.rebase.text', { current: gitInfo?.currentBranch, target: targetBranch }),
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: t('common.confirm'),
      cancelButtonText: t('common.cancel')
    });
    if (!isConfirmed) return;
    try {
      const res = await rebaseBranch(currentPath, targetBranch);
      if (res.conflict) {
        setConflictFiles(res.files);
        setConflictType('rebase');
        setConflictTheirsBranch(targetBranch);
        setActiveTab('conflicts');
        return;
      }
      const data = await handleRefreshGitInfo();
      setSelectedBranch(data.currentBranch);
      await handleLoadGraph();
    } catch (err: any) {
      Swal.fire({ icon: 'error', title: i18n.t('dialog.rebaseFail'), text: err.response?.data?.error || err.message });
    }
  };

  const handleContextMenuOpen = (e: React.MouseEvent, branch: string) => {
    e.preventDefault();
    const isCurrent = branch === gitInfo?.currentBranch;
    const actions: { label: string; onClick: () => void; danger?: boolean }[] = [];

    if (!isCurrent) {
      actions.push({ label: t('context.checkout', { branch }), onClick: () => handleCheckoutBranch(branch) });
    }

    actions.push({ label: t('context.create', { branch }), onClick: () => handleCreateBranch(branch) });

    if (!isCurrent) {
      actions.push({ label: t('context.merge', { branch, current: gitInfo?.currentBranch }), onClick: () => handleMergeBranch(branch) });
      actions.push({ label: t('context.rebase', { current: gitInfo?.currentBranch, branch }), onClick: () => handleRebaseBranch(branch) });
    }

    actions.push({ label: t('context.compare', { branch, current: gitInfo?.currentBranch }), onClick: () => handleCompareBranches(branch) });
    actions.push({ label: t('context.fetch'), onClick: () => handleFetch() });
    actions.push({ label: t('context.push'), onClick: () => handlePushBranch(branch) });
    actions.push({ label: t('context.rename'), onClick: () => handleRenameBranch(branch) });

    if (!isCurrent) {
      actions.push({ label: t('context.delete'), onClick: () => handleDeleteBranch(branch), danger: true });
    }

    setContextMenu({ x: e.clientX, y: e.clientY, items: actions });
  };

  const handleCommitContextMenu = (e: React.MouseEvent, commit: GraphCommit) => {
    e.preventDefault();
    e.stopPropagation();
    const actions: { label: string; onClick: () => void; danger?: boolean; disabled?: boolean }[] = [];
    actions.push({ label: t('context.cherryPick'), onClick: () => handleCherryPick(commit.hash), disabled: commit.isOnHeadBranch });
    actions.push({ label: t('context.revert'), onClick: () => handleRevertCommit(commit.hash) });
    setContextMenu({ x: e.clientX, y: e.clientY, items: actions });
  };

  const handleCherryPick = async (commitHash: string) => {
    try {
      const res = await cherryPickCommit(currentPath, commitHash);
      if (res.conflict) {
        setConflictFiles(res.files);
        setConflictType('cherry-pick');
        setConflictTheirsBranch(res.theirsBranch || null);
        setActiveTab('conflicts');
        return;
      }
      Swal.fire({ icon: 'success', title: t('dialog.cherryPick.success'), timer: 2000, showConfirmButton: false });
      const data = await handleRefreshGitInfo();
      setSelectedBranch(data.currentBranch);
      await handleLoadGraph();
    } catch (err: any) {
      Swal.fire({ icon: 'error', title: t('dialog.cherryPick.fail'), text: err.response?.data?.error || err.message });
    }
  };

  const handleRevertCommit = async (commitHash: string) => {
    try {
      await revertCommit(currentPath, commitHash);
      Swal.fire({ icon: 'success', title: t('dialog.revert.success'), timer: 2000, showConfirmButton: false });
      const data = await handleRefreshGitInfo();
      setSelectedBranch(data.currentBranch);
      await handleLoadGraph();
    } catch (err: any) {
      Swal.fire({ icon: 'error', title: t('dialog.revert.fail'), text: err.response?.data?.error || err.message });
    }
  };

  const loadFileDiff = async (filePath: string, type: string) => {
    setLocalFileDiffLoading(true);
    try {
      const data = await fetchLocalFileDiff(currentPath, filePath, type);
      setLocalFileDiff(data.rows || []);
    } catch (_) {
      setLocalFileDiff([]);
    } finally {
      setLocalFileDiffLoading(false);
    }
  };

  const handleLoadLocalStatus = async () => {
    if (localStatusLoading) return;
    setLocalStatusLoading(true);
    try {
      const data = await fetchLocalStatus(currentPath);
      setLocalStatus(data);
      const stagedSel: Record<string, boolean> = {};
      data.staged.forEach((f: LocalStatusEntry) => { stagedSel[f.path] = true; });
      setSelectedStagedFiles(stagedSel);
      setSelectedUnstagedFiles({});
      if (data.staged.length > 0) {
        setSelectedLocalFile(data.staged[0].path);
        setSelectedLocalFileType('staged');
        await loadFileDiff(data.staged[0].path, 'staged');
      } else if (data.unstaged.length > 0) {
        setSelectedLocalFile(data.unstaged[0].path);
        setSelectedLocalFileType('unstaged');
        await loadFileDiff(data.unstaged[0].path, 'unstaged');
      } else {
        setSelectedLocalFile(null);
        setSelectedLocalFileType(null);
        setLocalFileDiff([]);
      }
    } catch (_) {
      setLocalStatus(null);
    } finally {
      setLocalStatusLoading(false);
    }
  };

  const handleSelectLocalFile = async (filePath: string, type: string) => {
    if (selectedLocalFile === filePath && selectedLocalFileType === type) return;
    setSelectedLocalFile(filePath);
    setSelectedLocalFileType(type);
    await loadFileDiff(filePath, type);
  };

  const handleToggleStagedFile = (path: string) => {
    setSelectedStagedFiles(prev => ({ ...prev, [path]: !prev[path] }));
  };

  const handleToggleUnstagedFile = (path: string) => {
    setSelectedUnstagedFiles(prev => ({ ...prev, [path]: !prev[path] }));
  };

  const handleToggleAllStaged = () => {
    if (!localStatus) return;
    const allSelected = localStatus.staged.every(f => selectedStagedFiles[f.path]);
    const next: Record<string, boolean> = {};
    localStatus.staged.forEach(f => { next[f.path] = !allSelected; });
    setSelectedStagedFiles(next);
  };

  const [restoreLoading, setRestoreLoading] = useState(false);

  const handleRestoreSelected = async () => {
    const selectedPaths = Object.keys(selectedUnstagedFiles).filter(k => selectedUnstagedFiles[k]);
    if (selectedPaths.length === 0) {
      Swal.fire({ icon: 'warning', title: t('local.noFilesSelected') });
      return;
    }
    const selectedObjs = (localStatus?.unstaged || []).filter(f => selectedUnstagedFiles[f.path]);
    const restorable = selectedObjs.filter(f => f.status !== 'untracked');
    const skipped = selectedObjs.filter(f => f.status === 'untracked');
    if (restorable.length === 0) {
      Swal.fire({ icon: 'info', title: t('local.restore'), text: t('local.restoreSkipAll') });
      return;
    }
    let confirmText = t('local.restoreConfirm', { count: restorable.length });
    if (skipped.length > 0) {
      confirmText += '\n' + t('local.restoreSkipCount', { count: skipped.length });
    }
    const result = await Swal.fire({
      icon: 'warning',
      title: t('local.restore'),
      text: confirmText,
      showCancelButton: true,
      confirmButtonText: t('common.confirm'),
      cancelButtonText: t('common.cancel'),
    });
    if (!result.isConfirmed) return;
    setRestoreLoading(true);
    try {
      const restorePaths = restorable.map(f => f.path);
      await restoreFile(currentPath, restorePaths);
      setSelectedUnstagedFiles({});
      if (selectedLocalFile && selectedLocalFileType === 'unstaged') {
        setSelectedLocalFile(null);
        setSelectedLocalFileType(null);
        setLocalFileDiff([]);
      }
      await handleLoadLocalStatus();
    } catch (err: any) {
      Swal.fire({ icon: 'error', title: t('local.restoreFail'), text: err.response?.data?.error || err.message });
    } finally {
      setRestoreLoading(false);
    }
  };

  const handleStageSelected = async () => {
    const selectedFiles = Object.keys(selectedUnstagedFiles).filter(k => selectedUnstagedFiles[k]);
    if (selectedFiles.length === 0) {
      Swal.fire({ icon: 'warning', title: t('local.noFilesSelected') });
      return;
    }
    setStageLoading(true);
    try {
      await stageFiles(currentPath, selectedFiles);
      setSelectedUnstagedFiles({});
      await handleLoadLocalStatus();
    } catch (err: any) {
      Swal.fire({ icon: 'error', title: t('local.stageFail'), text: err.response?.data?.error || err.message });
    } finally {
      setStageLoading(false);
    }
  };

  const handleUnstageSelected = async () => {
    const selectedPaths = Object.keys(selectedStagedFiles).filter(k => selectedStagedFiles[k]);
    if (selectedPaths.length === 0) {
      Swal.fire({ icon: 'warning', title: t('local.noFilesSelected') });
      return;
    }
    const result = await Swal.fire({
      icon: 'warning',
      title: t('local.unstage'),
      text: t('local.unstageConfirm', { count: selectedPaths.length }),
      showCancelButton: true,
      confirmButtonText: t('common.confirm'),
      cancelButtonText: t('common.cancel'),
    });
    if (!result.isConfirmed) return;
    setUnstageLoading(true);
    try {
      await unstageFiles(currentPath, selectedPaths);
      setSelectedStagedFiles({});
      if (selectedLocalFile && selectedLocalFileType === 'staged') {
        setSelectedLocalFile(null);
        setSelectedLocalFileType(null);
        setLocalFileDiff([]);
      }
      await handleLoadLocalStatus();
    } catch (err: any) {
      Swal.fire({ icon: 'error', title: t('local.unstageFail'), text: err.response?.data?.error || err.message });
    } finally {
      setUnstageLoading(false);
    }
  };

  const handleToggleAllUnstaged = () => {
    if (!localStatus) return;
    const allSelected = localStatus.unstaged.every(f => selectedUnstagedFiles[f.path]);
    const next: Record<string, boolean> = {};
    localStatus.unstaged.forEach(f => { next[f.path] = !allSelected; });
    setSelectedUnstagedFiles(next);
  };

  const getSelectedFiles = (): string[] => [
    ...Object.keys(selectedStagedFiles).filter(k => selectedStagedFiles[k]),
    ...Object.keys(selectedUnstagedFiles).filter(k => selectedUnstagedFiles[k])
  ];

  const handleCommit = async () => {
    const msg = commitMessage.trim();
    if (!msg) {
      Swal.fire({ icon: 'warning', title: t('local.noMessage') });
      return;
    }
    const selectedFiles = getSelectedFiles();
    if (selectedFiles.length === 0) {
      Swal.fire({ icon: 'warning', title: t('local.noFilesSelected') });
      return;
    }
    setCommitLoading(true);
    try {
      await commitChanges(currentPath, msg, selectedFiles);
      Swal.fire({ icon: 'success', title: t('local.commitSuccess'), timer: 1500, showConfirmButton: false });
      setCommitMessage('');
      setLocalFileDiff([]);
      setSelectedLocalFile(null);
      await handleLoadLocalStatus();
      await handleLoadGraph(1);
      const data = await handleRefreshGitInfo();
      setSelectedBranch(data.currentBranch);
    } catch (err: any) {
      Swal.fire({ icon: 'error', title: t('local.commitFail'), text: err.response?.data?.error || err.message });
    } finally {
      setCommitLoading(false);
    }
  };

  const handleCommitAndPush = async () => {
    const msg = commitMessage.trim();
    if (!msg) {
      Swal.fire({ icon: 'warning', title: t('local.noMessage') });
      return;
    }
    const selectedFiles = getSelectedFiles();
    if (selectedFiles.length === 0) {
      Swal.fire({ icon: 'warning', title: t('local.noFilesSelected') });
      return;
    }
    setCommitLoading(true);
    try {
      await commitChanges(currentPath, msg, selectedFiles);
      let data = await handleRefreshGitInfo();
      const branch = data.currentBranch;
      const confirmed = await confirmPushDialog(branch);
      if (!confirmed) {
        Swal.fire({ icon: 'info', title: t('local.pushCancel'), timer: 1500, showConfirmButton: false });
      } else {
        await pushBranch(currentPath, branch);
        data = await handleRefreshGitInfo();
        Swal.fire({ icon: 'success', title: t('local.commitPushSuccess'), timer: 1500, showConfirmButton: false });
      }
      setCommitMessage('');
      setLocalFileDiff([]);
      setSelectedLocalFile(null);
      await handleLoadLocalStatus();
      await handleLoadGraph(1);
      setSelectedBranch(branch);
    } catch (err: any) {
      Swal.fire({ icon: 'error', title: t('local.commitPushFail'), text: err.response?.data?.error || err.message });
    } finally {
      setCommitLoading(false);
    }
  };

  const handleRefresh = async () => {
    await handleRefreshGitInfo();
    await handleLoadGraph(1, commitPageSize, selectedBranch || undefined);
    handleLoadLocalStatus();
  };

  const handleSwitchLang = () => {
    const next = i18n.language === 'zh' ? 'en' : 'zh';
    i18n.changeLanguage(next);
    saveUiState({ lang: next }).catch(() => {});
  };

  const handleSwitchTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
  };

  const isSidebarCollapsed = sidebarWidth < 20;

  const handleSidebarMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    startX.current = e.clientX;
    startWidth.current = Math.max(0, sidebarRef.current?.offsetWidth || sidebarWidth);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [sidebarWidth]);

  const handleSidebarMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging.current) return;
    const delta = e.clientX - startX.current;
    setSidebarWidth(Math.max(0, startWidth.current + delta));
  }, []);

  const handleSidebarMouseUp = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  useEffect(() => {
    document.addEventListener('mousemove', handleSidebarMouseMove);
    document.addEventListener('mouseup', handleSidebarMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleSidebarMouseMove);
      document.removeEventListener('mouseup', handleSidebarMouseUp);
    };
  }, [handleSidebarMouseMove, handleSidebarMouseUp]);

  const [localSidebarWidth, setLocalSidebarWidth] = useState(280);
  const localSidebarDragging = useRef(false);
  const localViewRef = useRef<HTMLDivElement>(null);
  const localDragStartX = useRef(0);
  const localDragStartW = useRef(280);

  const handleLocalSidebarMouseDown = (e: React.MouseEvent) => {
    localSidebarDragging.current = true;
    localDragStartX.current = e.clientX;
    localDragStartW.current = localSidebarWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!localSidebarDragging.current) return;
      const el = localViewRef.current;
      if (!el) return;
      const delta = e.clientX - localDragStartX.current;
      const w = Math.min(el.offsetWidth * 0.6, Math.max(200, localDragStartW.current + delta));
      setLocalSidebarWidth(w);
    };
    const onUp = () => {
      if (!localSidebarDragging.current) return;
      localSidebarDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [localSidebarWidth]);

  const [diffSplitPct, setDiffSplitPct] = useState(0.5);
  const diffDragging = useRef(false);
  const diffBodyRef = useRef<HTMLDivElement>(null);
  const ROW_HEIGHT = 20;
  const SCROLL_BUFFER = 20;
  const [diffScrollTop, setDiffScrollTop] = useState(0);
  const [diffContainerHeight, setDiffContainerHeight] = useState(600);
  const diffVirtualRef = useRef<HTMLDivElement>(null);

  const handleDiffScroll = useCallback(() => {
    if (diffVirtualRef.current) {
      setDiffScrollTop(diffVirtualRef.current.scrollTop);
    }
  }, []);

  const diffVirtualRows = useMemo(() => {
    const total = localFileDiff.length;
    const startIdx = Math.max(0, Math.floor(diffScrollTop / ROW_HEIGHT) - SCROLL_BUFFER);
    const endIdx = Math.min(total, Math.ceil((diffScrollTop + diffContainerHeight) / ROW_HEIGHT) + SCROLL_BUFFER);
    return { startIdx, endIdx, total, offsetY: startIdx * ROW_HEIGHT, visible: localFileDiff.slice(startIdx, endIdx) };
  }, [localFileDiff, diffScrollTop, diffContainerHeight]);

  useEffect(() => {
    setDiffScrollTop(0);
    if (diffVirtualRef.current) diffVirtualRef.current.scrollTop = 0;
  }, [selectedLocalFile]);

  useEffect(() => {
    const el = diffVirtualRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setDiffContainerHeight(entry.contentRect.height);
    });
    ro.observe(el);
    setDiffContainerHeight(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  const handleDiffMouseDown = (e: React.MouseEvent) => {
    diffDragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!diffDragging.current) return;
      const el = diffBodyRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      setDiffSplitPct(Math.min(0.85, Math.max(0.2, pct)));
    };
    const onUp = () => {
      if (!diffDragging.current) return;
      diffDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, []);

  const handleToggleCommit = async (commitHash: string) => {
    if (expandedCommit === commitHash) {
      setExpandedCommit(null);
      setCommitFiles(null);
      setExpandedFile(null);
      setFileDiff('');
      return;
    }
    setExpandedCommit(commitHash);
    setExpandedFile(null);
    setFileDiff('');
    setCommitFilesLoading(true);
    try {
      const data = await fetchCommitFiles(currentPath, commitHash);
      setCommitFiles(data.files);
    } catch (_) {
      setCommitFiles([]);
    } finally {
      setCommitFilesLoading(false);
    }
  };

  const handleToggleFile = async (commitHash: string, filePath: string) => {
    if (expandedFile === filePath) {
      setExpandedFile(null);
      setFileDiff('');
      return;
    }
    setExpandedFile(filePath);
    setFileDiffLoading(true);
    try {
      const data = await fetchCommitFileDiff(currentPath, commitHash, filePath);
      setFileDiff(data.diff);
    } catch (_) {
      setFileDiff('Error loading diff');
    } finally {
      setFileDiffLoading(false);
    }
  };

  useEffect(() => {
    if (view === 'analyze' && activeTab === 'commits') {
      handleLoadGraph(1, commitPageSize, selectedBranch || undefined);
    }
    if (view === 'analyze' && activeTab === 'local') {
      handleLoadLocalStatus();
    }
  }, [view, activeTab, selectedBranch]);

  useEffect(() => {
    if (view === 'analyze' && currentPath && gitInfo) {
      (async () => {
        try {
          const { files, type, theirsBranch } = await fetchConflictFiles(currentPath);
          if (files && files.length > 0) {
            setConflictFiles(files);
            setConflictType(type || 'merge');
            setConflictTheirsBranch(theirsBranch || null);
            setActiveTab('conflicts');
          }
        } catch (_) {}
      })();
    }
  }, [view, currentPath, gitInfo]);

  const loadLocalRef = useRef(handleLoadLocalStatus);
  loadLocalRef.current = handleLoadLocalStatus;
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  useEffect(() => {
    if (view !== 'analyze' || !currentPath) return;

    let es: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout>;

    function connect() {
      es?.close();
      es = new EventSource(`${API_BASE_URL}/api/file-events?dirPath=${encodeURIComponent(currentPath)}`);
      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === 'file-change' && activeTabRef.current === 'local') {
            loadLocalRef.current();
          }
        } catch (_) {}
      };
      es.onerror = () => {
        es?.close();
        retryTimer = setTimeout(connect, 2000);
      };
    }

    connect();

    return () => {
      es?.close();
      clearTimeout(retryTimer);
    };
  }, [view, currentPath]);

  if (initialLoading) {
    return <div className="git-visualizer"><p className="initial-loading">{t('common.restoring')}</p></div>;
  }

  if (view === 'analyze' && gitInfo?.isGitRepo) {
    return (
      <div className="analyze-view" onContextMenu={(e) => e.preventDefault()}>
        <div className="analyze-header">
          <button onClick={handleReselect} className="reselect-button">{t('analyze.reselect')}</button>
          <span className="analyze-path">{currentPath}</span>
          <div className="analyze-tabs">
            <button className={`analyze-tab${activeTab === 'commits' ? ' analyze-tab--active' : ''}`} onClick={() => setActiveTab('commits')}>{t('analyze.tabCommits')}</button>
            <button className={`analyze-tab${activeTab === 'local' ? ' analyze-tab--active' : ''}`} onClick={() => setActiveTab('local')}>{t('analyze.tabLocal')}</button>
            {compareData && (
              <button className={`analyze-tab${activeTab === 'compare' ? ' analyze-tab--active' : ''}`} onClick={() => setActiveTab('compare')}>{t('analyze.tabCompare')}</button>
            )}
            {conflictFiles && (
              <button className={`analyze-tab${activeTab === 'conflicts' ? ' analyze-tab--active' : ''} analyze-tab--conflict`} onClick={() => setActiveTab('conflicts')}>{t('dialog.conflict')}</button>
            )}
          </div>
          <button className="refresh-button" onClick={handleRefresh} title={t('analyze.refresh')}>{t('analyze.refresh')}</button>
          <button className="lang-switch" onClick={handleSwitchLang}>{i18n.language === 'zh' ? 'EN' : '中文'}</button>
          <button className="theme-switch" onClick={handleSwitchTheme}>{theme === 'light' ? '🌙' : '☀️'}</button>
        </div>
        <div className="analyze-body">
          <div className={`analyze-sidebar${isSidebarCollapsed ? ' analyze-sidebar--collapsed' : ''}`} ref={sidebarRef} style={{ width: isSidebarCollapsed ? 0 : sidebarWidth }}>
            {!isSidebarCollapsed && (
              <>
                <BranchList
                  title={t('branch.local')}
                  branches={gitInfo.localBranches}
                  currentBranch={gitInfo.currentBranch}
                  selectedBranch={selectedBranch}
                  onSelect={handleBranchSelect}
                  onDoubleClick={handleBranchDoubleClick}
                  onContextMenuOpen={handleContextMenuOpen}
                />
                <BranchList
                  title={t('branch.remote')}
                  branches={gitInfo.remoteBranches}
                  currentBranch={gitInfo.currentBranch}
                  selectedBranch={selectedBranch}
                  onSelect={handleBranchSelect}
                  onDoubleClick={handleBranchDoubleClick}
                  onContextMenuOpen={handleContextMenuOpen}
                />
              </>
            )}
          </div>
          <div className="sidebar-resize-handle" onMouseDown={handleSidebarMouseDown} />
          <div className="analyze-main">
            {activeTab === 'commits' && (
              <div className="commit-pagination-box">
                <div className="commit-header">
                  {selectedBranch && <span className="commit-header-label">{selectedBranch}</span>}
                  <span className="commit-header-count">{t('commit.count', { count: commitsTotal })}</span>
                </div>
                <div className="commit-list">
                  {graphLoading ? (
                    <p className="commit-status">{t('commit.loading')}</p>
                  ) : graphRows.length === 0 ? (
                    <p className="commit-status">{t('commit.empty')}</p>
                  ) : (
                    graphRows.map((row) => {
                      if (!row.commit) return null;
                      const c = row.commit;
                      return (
                        <div key={c.hash} className="commit-item" onContextMenu={(e) => handleCommitContextMenu(e, c)}>
                          <div className="commit-content" onClick={() => handleToggleCommit(c.hash)}>
                              <div className={`commit-message${c.message.startsWith('Merge ') ? ' commit-message--merge' : ''}`}>{c.message}</div>
                              <div className="commit-meta">
                                <span className="commit-hash">{c.hash.slice(0, 7)}{c.needsPush ? <span className="commit-needs-push"> ↑</span> : ''}</span>
                                <span className="commit-author">{c.author}</span>
                                <span className="commit-date">{c.date?.split('T')[0] || c.date}</span>
                              </div>
                            </div>
                          {expandedCommit === c.hash && (
                            <div className="commit-files">
                              {commitFilesLoading ? (
                                <p className="commit-files-loading">{t('common.loading')}</p>
                              ) : commitFiles && commitFiles.length > 0 ? (
                                commitFiles.map((f, i) => (
                                  <div key={i} className="commit-file-item">
                                    <div className="commit-file-header" onClick={() => handleToggleFile(c.hash, f.filePath)}>
                                      <span className={`commit-file-status commit-file-status--${f.status.toLowerCase()}`}>
                                        {f.status === 'A' ? t('commit.fileAdded') : f.status === 'D' ? t('commit.fileDeleted') : t('commit.fileModified')}
                                      </span>
                                      <span className="commit-file-path">{f.filePath}</span>
                                      <span className="commit-file-toggle">{expandedFile === f.filePath ? '▼' : '▶'}</span>
                                    </div>
                                    {expandedFile === f.filePath && (
                                      <pre className="commit-file-diff">
                                        {fileDiffLoading ? (
                                          <p className="commit-files-loading">{t('common.loading')}</p>
                                        ) : (
                                          fileDiff.split('\n').map((line, li) => {
                                            let cls = '';
                                            if (line.startsWith('+') && !line.startsWith('+++')) cls = 'diff-add';
                                            else if (line.startsWith('-') && !line.startsWith('---')) cls = 'diff-remove';
                                            else if (line.startsWith('@@')) cls = 'diff-hunk';
                                            return <div key={li} className={cls}>{line}</div>;
                                          })
                                        )}
                                      </pre>
                                    )}
                                  </div>
                                ))
                              ) : (
                                <p className="commit-files-loading">{t('commit.filesEmpty')}</p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
                <div className="commit-pagination">
                  <div className="commit-pagination-left">
                    <select className="commit-page-size" value={commitPageSize} onChange={handlePageSizeChange}>
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                      <option value={200}>200</option>
                    </select>
                    <span className="commit-page-size-label">{t('commit.pageSize')}</span>
                  </div>
                  <div className="commit-pagination-center">
                    <button className="btn btn--small" disabled={commitPage <= 1} onClick={handlePrevPage}>{t('commit.prevPage')}</button>
                    <span className="commit-pagination-info">{commitPage} / {totalCommitPages}</span>
                    <button className="btn btn--small" disabled={commitPage >= totalCommitPages} onClick={handleNextPage}>{t('commit.nextPage')}</button>
                  </div>
                  <div className="commit-pagination-right">
                    <input
                      className="commit-go-to-input"
                      type="number"
                      min={1}
                      max={totalCommitPages}
                      value={commitPageInput}
                      onChange={(e) => setCommitPageInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleGoToPage()}
                    />
                    <button className="btn btn--small" onClick={handleGoToPage}>{t('commit.goToPage')}</button>
                  </div>
                </div>
              </div>
            )}
            {activeTab === 'compare' && compareData && (
              <div className="compare-view">
                <div className="compare-sections">
                  <div className="compare-section">
                    <h3 className="compare-section-title">{t('compare.hasNot', { branch1: compareData.compareBranch, branch2: compareData.baseBranch })}</h3>
                    <span className="compare-section-count">{t('compare.commits', { count: compareData.compareAheadTotal })}</span>
                    {compareData.compareAhead.length === 0 ? (
                      <p className="compare-empty">{t('compare.empty')}</p>
                    ) : (
                      <div className="compare-commit-list">
                        {compareData.compareAhead.map(c => (
                          <div key={c.hash} className={`compare-commit-item${selectedDiffCommit === c.hash ? ' compare-commit-item--active' : ''}`} onClick={() => handleLoadDiff(c.hash)}>
                            <span className="compare-commit-hash">{c.hash}</span>
                            <span className="compare-commit-msg">{c.message}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="compare-section">
                    <h3 className="compare-section-title">{t('compare.hasNot', { branch1: compareData.baseBranch, branch2: compareData.compareBranch })}</h3>
                    <span className="compare-section-count">{t('compare.commits', { count: compareData.baseAheadTotal })}</span>
                    {compareData.baseAhead.length === 0 ? (
                      <p className="compare-empty">{t('compare.empty')}</p>
                    ) : (
                      <div className="compare-commit-list">
                        {compareData.baseAhead.map(c => (
                          <div key={c.hash} className={`compare-commit-item${selectedDiffCommit === c.hash ? ' compare-commit-item--active' : ''}`} onClick={() => handleLoadDiff(c.hash)}>
                            <span className="compare-commit-hash">{c.hash}</span>
                            <span className="compare-commit-msg">{c.message}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                {diffLoading && <p className="commit-status">{t('compare.diffLoading')}</p>}
                {diffMeta && (
                  <div className="diff-panel">
                    <div className="diff-header">
                      <span className="diff-header-hash">{diffMeta.hash}</span>
                      <span className="diff-header-msg">{diffMeta.message}</span>
                      <span className="diff-header-author">{diffMeta.author}</span>
                      <span className="diff-header-date">{diffMeta.date?.split('T')[0] || diffMeta.date}</span>
                    </div>
                    <pre className="diff-content">
                      {diffContent.split('\n').map((line, i) => {
                        let cls = '';
                        if (line.startsWith('+') && !line.startsWith('+++')) cls = 'diff-add';
                        else if (line.startsWith('-') && !line.startsWith('---')) cls = 'diff-remove';
                        else if (line.startsWith('@@')) cls = 'diff-hunk';
                        return <div key={i} className={cls}>{line}</div>;
                      })}
                    </pre>
                  </div>
                )}
              </div>
            )}
            {activeTab === 'local' && (
              <div className="local-view" ref={localViewRef}>
                <div className="local-sidebar" style={{ width: localSidebarWidth }}>
                  <textarea
                    className="commit-msg-input"
                    placeholder={t('local.commitPlaceholder')}
                    value={commitMessage}
                    onChange={(e) => setCommitMessage(e.target.value)}
                  />
                  <div className="commit-actions-wrap">
                    {commitLoading && <div className="commit-progress-bar" />}
                    <div className="commit-actions">
                      <button
                        className="btn btn--primary"
                        disabled={!commitMessage.trim() || commitLoading}
                        onClick={handleCommit}
                      >{t('local.commit')}</button>
                      <button
                        className="btn btn--primary"
                        disabled={!commitMessage.trim() || commitLoading}
                        onClick={handleCommitAndPush}
                      >{t('local.commitPush')}</button>
                    </div>
                  </div>
                  {localStatusLoading ? (
                    <p className="local-status-loading">{t('common.loading')}</p>
                  ) : !localStatus ? (
                    <p className="local-status-loading" onClick={handleLoadLocalStatus}>{t('local.clickLoad')}</p>
                  ) : (
                    <div className="local-files">
                      <div className="file-section">
                          <div className="file-section-header">
                          <label className="file-section-checkall">
                            <input
                              type="checkbox"
                              checked={localStatus.staged.length > 0 && localStatus.staged.every(f => selectedStagedFiles[f.path])}
                              onChange={handleToggleAllStaged}
                            />
                            <span className="file-section-title">{t('local.staged')} ({localStatus.staged.length})</span>
                          </label>
                          {localStatus.staged.length > 0 && (
                            <div className="commit-actions-wrap">
                              {unstageLoading && <div className="commit-progress-bar" />}
                              <button className="btn btn--danger btn--stage" disabled={unstageLoading} onClick={handleUnstageSelected}>{t('local.unstage')}</button>
                            </div>
                          )}
                        </div>
                        <div className="file-section-list">
                          {localStatus.staged.length === 0 ? (
                            <p className="file-section-empty">{t('local.noStaged')}</p>
                          ) : (
                            localStatus.staged.map((f) => (
                              <div key={f.path} className="file-item-row">
                                <label className="file-item-checkbox">
                                  <input
                                    type="checkbox"
                                    checked={!!selectedStagedFiles[f.path]}
                                    onChange={() => handleToggleStagedFile(f.path)}
                                  />
                                </label>
                                <div
                                  className={`file-item${selectedLocalFile === f.path && selectedLocalFileType === 'staged' ? ' file-item--selected' : ''}`}
                                  onClick={() => handleSelectLocalFile(f.path, 'staged')}
                                >
                                  <span className="file-item-status file-item-status--staged">{f.status === 'added' ? 'A' : f.status === 'deleted' ? 'D' : f.status === 'renamed' ? 'R' : 'M'}</span>
                                  <span className="file-item-path">{f.path}</span>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                        <div className="file-section">
                          <div className="file-section-header">
                            <label className="file-section-checkall">
                              <input
                                type="checkbox"
                                checked={localStatus.unstaged.length > 0 && localStatus.unstaged.every(f => selectedUnstagedFiles[f.path])}
                                onChange={handleToggleAllUnstaged}
                              />
                              <span className="file-section-title">{t('local.unstaged')} ({localStatus.unstaged.length})</span>
                            </label>
                            {localStatus.unstaged.length > 0 && (
                              <div className="commit-actions-wrap">
                                {stageLoading && <div className="commit-progress-bar" />}
                                <button className="btn btn--danger btn--stage" disabled={restoreLoading} onClick={handleRestoreSelected}>{t('local.restore')}</button>
                                <button className="btn btn--primary btn--stage" disabled={stageLoading} onClick={handleStageSelected}>{t('local.stage')}</button>
                              </div>
                            )}
                          </div>
                          <div className="file-section-list">
                          {localStatus.unstaged.length === 0 ? (
                            <p className="file-section-empty">{t('local.noUnstaged')}</p>
                          ) : (
                            localStatus.unstaged.map((f) => (
                              <div key={f.path} className="file-item-row">
                                <label className="file-item-checkbox">
                                  <input
                                    type="checkbox"
                                    checked={!!selectedUnstagedFiles[f.path]}
                                    onChange={() => handleToggleUnstagedFile(f.path)}
                                  />
                                </label>
                                <div
                                  className={`file-item${selectedLocalFile === f.path && selectedLocalFileType === 'unstaged' ? ' file-item--selected' : ''}`}
                                  onClick={() => handleSelectLocalFile(f.path, 'unstaged')}
                                >
                                  <span className="file-item-status file-item-status--unstaged">{f.status === 'untracked' ? 'U' : f.status === 'deleted' ? 'D' : 'M'}</span>
                                  <span className="file-item-path">{f.path}</span>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <div className="local-resize-handle" onMouseDown={handleLocalSidebarMouseDown} />
                <div className="local-main">
                  {!selectedLocalFile ? (
                    <p className="local-diff-empty">{t('local.selectFile')}</p>
                  ) : localFileDiffLoading ? (
                    <p className="local-diff-loading">{t('common.loading')}</p>
                  ) : (
                    <div className="local-diff-view">
                      <div className="local-diff-header">
                        <span className="local-diff-file">{selectedLocalFile}</span>
                        <span className="local-diff-type">{selectedLocalFileType === 'staged' ? t('local.stagedType') : t('local.unstagedType')}</span>
                      </div>
                      <div className="side-by-side-diff">
                        <div className="side-by-side-header">
                          <div className="side-by-side-label" style={{ width: `${diffSplitPct * 100}%`, flex: 'none', minWidth: 200 }}>{t('local.original')}</div>
                          <div className="side-by-side-label">{t('local.modified')}</div>
                        </div>
                        <div className="side-by-side-body" ref={(el) => { (diffBodyRef as React.MutableRefObject<HTMLDivElement | null>).current = el; (diffVirtualRef as React.MutableRefObject<HTMLDivElement | null>).current = el; }} style={{ '--left-pct': `${diffSplitPct * 100}%` } as React.CSSProperties} onScroll={handleDiffScroll}>
                          <div className="diff-handle" onMouseDown={handleDiffMouseDown} />
                          <div style={{ height: diffVirtualRows.total * ROW_HEIGHT, position: 'relative' }}>
                            <div style={{ position: 'absolute', top: diffVirtualRows.offsetY, left: 0, right: 0 }}>
                              {diffVirtualRows.visible.map((row, i) => {
                                const idx = diffVirtualRows.startIdx + i;
                                return (
                                  <div key={idx} className="diff-row">
                                    {row.oldContent !== null ? (
                                      <div className={`diff-cell${row.oldType === 'remove' ? ' diff-cell--remove' : ''}`}>
                                        <span className="diff-line-num">{row.oldLine}</span>
                                        <span className="diff-line-content">{row.oldContent}</span>
                                      </div>
                                    ) : (
                                      <div className="diff-cell" />
                                    )}
                                    {row.newContent !== null ? (
                                      <div className={`diff-cell${row.newType === 'add' ? ' diff-cell--add' : ''}`}>
                                        <span className="diff-line-num">{row.newLine}</span>
                                        <span className="diff-line-content">{row.newContent}</span>
                                      </div>
                                    ) : (
                                      <div className="diff-cell" />
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
            {activeTab === 'conflicts' && conflictFiles && (
              <ConflictResolver
                currentPath={currentPath}
                currentBranch={gitInfo.currentBranch}
                conflictFiles={conflictFiles}
                conflictType={conflictType}
                theirsBranch={conflictTheirsBranch}
                onAbort={handleAbortConflict}
                onRefresh={handleRefreshGitInfo}
                onFileResolved={handleConflictResolved}
              />
            )}
          </div>
        </div>
        {contextMenu && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            items={contextMenu.items}
            onClose={handleCloseContextMenu}
          />
        )}
      </div>
    );
  }

  return (
    <div className="git-visualizer">
      <div className="select-header">
        <h1>{t('select.title')}</h1>
        <button className="lang-switch" onClick={handleSwitchLang}>{i18n.language === 'zh' ? 'EN' : '中文'}</button>
        <button className="theme-switch" onClick={handleSwitchTheme}>{theme === 'light' ? '🌙' : '☀️'}</button>
      </div>

      <div className="path-input-row">
        <input
          type="text"
          placeholder={t('select.placeholder')}
          value={inputPath}
          onChange={e => setInputPath(e.target.value)}
          onKeyDown={handleKeyDown}
          className="path-input"
        />
        <button onClick={handleGoPath} className="btn btn--primary">{t('select.go')}</button>
        <button onClick={handleLoadDrives} className="btn btn--secondary">{t('select.drives')}</button>
      </div>

      <div className="path-display">
        <strong>{t('select.currentPath')}</strong> {currentPath || t('select.noPath')}
        {parentPath && (
          <button onClick={handleParentClick} className="btn btn--small">{t('select.parentDir')}</button>
        )}
      </div>

      <div className="button-group">
        <button
          onClick={handleCheckGit}
          disabled={loading || !currentPath}
          className="btn btn--primary btn--large"
        >
          {loading ? t('select.checking') : t('select.checkGit')}
        </button>
      </div>

      {error && <div className="error-msg">{error}</div>}

      {gitInfo && !gitInfo.isGitRepo && (
        <div className="not-repo-msg">
          <p>{t('select.notRepo')}</p>
        </div>
      )}

      <div className="directory-browser">
        <h2 className="directory-browser-title">{showDrives ? t('select.selectDrive') : t('select.browser')}</h2>
        <div className="directory-browser-list">
          {loading ? (
            <p>{t('common.loading')}</p>
          ) : showDrives ? (
            drives.map((drive, index) => (
              <div key={index} className="directory-item directory-item--drive" onClick={() => handleDriveClick(drive.path)}>
                💾 {drive.name}
              </div>
            ))
          ) : directories.length === 0 ? (
            <p className="empty-hint">{t('select.emptyDir')}</p>
          ) : (
            directories.map((dir, index) => (
              <div key={index} className="directory-item" onClick={() => handleDirectoryClick(dir.path)}>
                📁 {dir.name}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default GitVisualizer;
