import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from './i18n';
import Swal from 'sweetalert2';
import {
  fetchDrives, fetchDirectories, checkGit, fetchCommits,
  saveLastPath, getLastPath,
  checkoutBranch, createBranch, mergeBranch, renameBranch,
  deleteBranch, pushBranch, fetchAll, compareBranches, getCommitDiff, rebaseBranch,
  fetchCommitFiles, fetchCommitFileDiff
} from './api';
import BranchList from './components/BranchList';
import ContextMenu from './components/ContextMenu';
import './GitVisualizer.css';

function GitVisualizer() {
  const { t } = useTranslation();
  const [view, setView] = useState('select');
  const [currentPath, setCurrentPath] = useState('');
  const [parentPath, setParentPath] = useState(null);
  const [directories, setDirectories] = useState([]);
  const [drives, setDrives] = useState([]);
  const [showDrives, setShowDrives] = useState(true);
  const [inputPath, setInputPath] = useState('');
  const [gitInfo, setGitInfo] = useState(null);
  const [selectedBranch, setSelectedBranch] = useState(null);
  const [commits, setCommits] = useState([]);
  const [commitsTotal, setCommitsTotal] = useState(0);
  const [commitPage, setCommitPage] = useState(1);
  const [commitPageSize] = useState(50);
  const [commitsLoading, setCommitsLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [initialLoading, setInitialLoading] = useState(true);
  const [contextMenu, setContextMenu] = useState(null);
  const [activeTab, setActiveTab] = useState('commits');
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const sidebarRef = useRef(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(260);
  const [compareData, setCompareData] = useState(null);
  const [selectedDiffCommit, setSelectedDiffCommit] = useState(null);
  const [diffContent, setDiffContent] = useState('');
  const [diffMeta, setDiffMeta] = useState(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [expandedCommit, setExpandedCommit] = useState(null);
  const [commitFiles, setCommitFiles] = useState(null);
  const [commitFilesLoading, setCommitFilesLoading] = useState(false);
  const [expandedFile, setExpandedFile] = useState(null);
  const [fileDiff, setFileDiff] = useState('');
  const [fileDiffLoading, setFileDiffLoading] = useState(false);

  useEffect(() => {
    (async () => {
      setInitialLoading(true);
      await handleLoadDrives();
      try {
        const lastPath = await getLastPath();
        if (lastPath) {
          await handleLoadDirectories(lastPath);
          await handleDoCheckGit(lastPath);
        }
      } catch (_) { /* ignore */ }
      setInitialLoading(false);
    })();
  }, []);

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
    } catch (err) {
      setError(t('error.loadDrives', { msg: err.response?.data?.error || err.message }));
    }
  };

  const handleLoadDirectories = async (dirPath) => {
    try {
      setLoading(true);
      const data = await fetchDirectories(dirPath);
      setDirectories(data.directories);
      setParentPath(data.parentPath);
      setCurrentPath(data.currentPath);
      setShowDrives(false);
      setGitInfo(null);
      setError('');
    } catch (err) {
      setError(t('error.loadDirectories', { msg: err.response?.data?.error || err.message }));
    } finally {
      setLoading(false);
    }
  };

  const handleDriveClick = (drivePath) => handleLoadDirectories(drivePath);
  const handleDirectoryClick = (dirPath) => handleLoadDirectories(dirPath);

  const handleParentClick = () => {
    if (parentPath) handleLoadDirectories(parentPath);
  };

  const handleGoPath = () => {
    const trimmed = inputPath.trim();
    if (trimmed) handleLoadDirectories(trimmed);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleGoPath();
  };

  const handleDoCheckGit = async (dirPath) => {
    try {
      setLoading(true);
      const data = await checkGit(dirPath);
      setGitInfo(data);
      setError('');

      if (data.isGitRepo) {
        saveLastPath(dirPath);
        setSelectedBranch(data.currentBranch);
        setView('analyze');
      }
    } catch (err) {
      setError(t('error.checkGit', { msg: err.response?.data?.error || err.message }));
    } finally {
      setLoading(false);
    }
  };

  const handleCheckGit = () => handleDoCheckGit(currentPath);

  const handleLoadCommits = async (branch, page = 1) => {
    try {
      setCommitsLoading(true);
      const data = await fetchCommits(currentPath, branch, page, commitPageSize);
      setCommits(data.commits);
      setCommitsTotal(data.totalCount);
      setCommitPage(page);
    } catch (_) {
      setCommits([]);
      setCommitsTotal(0);
    } finally {
      setCommitsLoading(false);
    }
  };

  const totalCommitPages = Math.ceil(commitsTotal / commitPageSize) || 1;

  const handlePrevPage = () => {
    if (commitPage > 1) handleLoadCommits(selectedBranch, commitPage - 1);
  };

  const handleNextPage = () => {
    if (commitPage < totalCommitPages) handleLoadCommits(selectedBranch, commitPage + 1);
  };

  const handleBranchSelect = (branch) => {
    setSelectedBranch(branch);
    handleLoadCommits(branch, 1);
  };

  const handleBranchDoubleClick = (branch) => {
    setSelectedBranch(branch);
    handleLoadCommits(branch, 1);
    setActiveTab('commits');
  };

  const handleReselect = () => setView('select');

  const handleCloseContextMenu = () => {
    setContextMenu(null);
  };

  const handleRefreshGitInfo = async () => {
    const data = await checkGit(currentPath);
    setGitInfo(data);
    return data;
  };

  const handleCheckoutBranch = async (branch) => {
    setCommitsLoading(true);
    try {
      await checkoutBranch(currentPath, branch);
      const data = await handleRefreshGitInfo();
      setSelectedBranch(data.currentBranch);
    } catch (err) {
      Swal.fire({ icon: 'error', title: i18n.t('dialog.checkoutFail'), text: err.response?.data?.error || err.message });
    } finally {
      setCommitsLoading(false);
    }
  };

  const handleCreateBranch = async (sourceBranch) => {
    const { value: name } = await Swal.fire({
      title: i18n.t('dialog.createBranch.title'),
      input: 'text',
      inputPlaceholder: i18n.t('dialog.createBranch.placeholder'),
      showCancelButton: true,
      confirmButtonText: t('common.create'),
      cancelButtonText: t('common.cancel'),
      inputValidator: (value) => value ? null : i18n.t('dialog.createBranch.emptyError')
    });
    if (!name) return;
    setLoading(true);
    try {
      await createBranch(currentPath, name, sourceBranch);
      await handleRefreshGitInfo();
    } catch (err) {
      Swal.fire({ icon: 'error', title: i18n.t('dialog.createFail'), text: err.response?.data?.error || err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleMergeBranch = async (sourceBranch) => {
    const { isConfirmed } = await Swal.fire({
      title: i18n.t('dialog.merge.title'),
      text: i18n.t('dialog.merge.text', { source: sourceBranch, current: gitInfo.currentBranch }),
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: t('common.confirm'),
      cancelButtonText: t('common.cancel')
    });
    if (!isConfirmed) return;
    setCommitsLoading(true);
    try {
      await mergeBranch(currentPath, sourceBranch);
      const data = await handleRefreshGitInfo();
      setSelectedBranch(data.currentBranch);
      await handleLoadCommits(data.currentBranch, 1);
    } catch (err) {
      Swal.fire({ icon: 'error', title: i18n.t('dialog.mergeFail'), text: err.response?.data?.error || err.message });
    } finally {
      setCommitsLoading(false);
    }
  };

  const handleRenameBranch = async (branch) => {
    const { value: newName } = await Swal.fire({
      title: i18n.t('dialog.rename.title'),
      input: 'text',
      inputValue: branch,
      showCancelButton: true,
      confirmButtonText: t('common.confirm'),
      cancelButtonText: t('common.cancel'),
      inputValidator: (value) => {
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
    } catch (err) {
      Swal.fire({ icon: 'error', title: i18n.t('dialog.renameFail'), text: err.response?.data?.error || err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteBranch = async (branch) => {
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
    } catch (err) {
      Swal.fire({ icon: 'error', title: i18n.t('dialog.deleteFail'), text: err.response?.data?.error || err.message });
    } finally {
      setLoading(false);
    }
  };

  const handlePushBranch = async (branch) => {
    setLoading(true);
    try {
      await pushBranch(currentPath, branch);
      Swal.fire({ icon: 'success', title: i18n.t('dialog.push.success', { branch }), timer: 2000, showConfirmButton: false });
    } catch (err) {
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
    } catch (err) {
      Swal.fire({ icon: 'error', title: i18n.t('dialog.fetch.fail'), text: err.response?.data?.error || err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleCompareBranches = async (compareBranch) => {
    setLoading(true);
    try {
      const data = await compareBranches(currentPath, gitInfo.currentBranch, compareBranch);
      setCompareData({ ...data, compareBranch, baseBranch: gitInfo.currentBranch });
      setActiveTab('compare');
      setSelectedDiffCommit(null);
      setDiffContent('');
      setDiffMeta(null);
    } catch (err) {
      Swal.fire({ icon: 'error', title: i18n.t('dialog.compareFail'), text: err.response?.data?.error || err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleLoadDiff = async (commitHash) => {
    if (selectedDiffCommit === commitHash) return;
    setSelectedDiffCommit(commitHash);
    setDiffLoading(true);
    try {
      const data = await getCommitDiff(currentPath, commitHash);
      setDiffMeta({ hash: data.commitHash, message: data.message, author: data.author, date: data.date });
      setDiffContent(data.diff);
    } catch (err) {
      Swal.fire({ icon: 'error', title: i18n.t('dialog.diffFail'), text: err.response?.data?.error || err.message });
    } finally {
      setDiffLoading(false);
    }
  };

  const handleRebaseBranch = async (targetBranch) => {
    const { isConfirmed } = await Swal.fire({
      title: i18n.t('dialog.rebase.title'),
      text: i18n.t('dialog.rebase.text', { current: gitInfo.currentBranch, target: targetBranch }),
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: t('common.confirm'),
      cancelButtonText: t('common.cancel')
    });
    if (!isConfirmed) return;
    setCommitsLoading(true);
    try {
      await rebaseBranch(currentPath, targetBranch);
      const data = await handleRefreshGitInfo();
      setSelectedBranch(data.currentBranch);
      await handleLoadCommits(data.currentBranch, 1);
    } catch (err) {
      Swal.fire({ icon: 'error', title: i18n.t('dialog.rebaseFail'), text: err.response?.data?.error || err.message });
    } finally {
      setCommitsLoading(false);
    }
  };

  const handleContextMenuOpen = (e, branch) => {
    e.preventDefault();
    const isCurrent = branch === gitInfo.currentBranch;
    const actions = [];

    if (!isCurrent) {
      actions.push({ label: t('context.checkout', { branch }), onClick: () => handleCheckoutBranch(branch) });
    }

    actions.push({ label: t('context.create', { branch }), onClick: () => handleCreateBranch(branch) });

    if (!isCurrent) {
      actions.push({ label: t('context.merge', { branch, current: gitInfo.currentBranch }), onClick: () => handleMergeBranch(branch) });
      actions.push({ label: t('context.rebase', { current: gitInfo.currentBranch, branch }), onClick: () => handleRebaseBranch(branch) });
    }

    actions.push({ label: t('context.compare', { branch, current: gitInfo.currentBranch }), onClick: () => handleCompareBranches(branch) });
    actions.push({ label: t('context.fetch'), onClick: () => handleFetch() });
    actions.push({ label: t('context.push'), onClick: () => handlePushBranch(branch) });
    actions.push({ label: t('context.rename'), onClick: () => handleRenameBranch(branch) });

    if (!isCurrent) {
      actions.push({ label: t('context.delete'), onClick: () => handleDeleteBranch(branch), danger: true });
    }

    setContextMenu({ x: e.clientX, y: e.clientY, items: actions });
  };

  const handleSwitchLang = () => {
    const next = i18n.language === 'zh' ? 'en' : 'zh';
    i18n.changeLanguage(next);
  };

  const handleSidebarMouseDown = useCallback((e) => {
    isDragging.current = true;
    startX.current = e.clientX;
    startWidth.current = sidebarRef.current?.offsetWidth || sidebarWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [sidebarWidth]);

  const handleSidebarMouseMove = useCallback((e) => {
    if (!isDragging.current) return;
    const delta = e.clientX - startX.current;
    setSidebarWidth(Math.max(80, startWidth.current + delta));
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

  const handleToggleCommit = async (commitHash) => {
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

  const handleToggleFile = async (commitHash, filePath) => {
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
    if (view === 'analyze' && selectedBranch && activeTab === 'commits') {
      handleLoadCommits(selectedBranch);
    }
  }, [view, activeTab]);

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
            {compareData && (
              <button className={`analyze-tab${activeTab === 'compare' ? ' analyze-tab--active' : ''}`} onClick={() => setActiveTab('compare')}>{t('analyze.tabCompare')}</button>
            )}
          </div>
          <button className="lang-switch" onClick={handleSwitchLang}>{i18n.language === 'zh' ? 'EN' : '中文'}</button>
        </div>
        <div className="analyze-body">
          <div className="analyze-sidebar" ref={sidebarRef} style={{ width: sidebarWidth }}>
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
          </div>
          <div className="sidebar-resize-handle" onMouseDown={handleSidebarMouseDown} />
          <div className="analyze-main">
            {activeTab === 'commits' && (
              <>
                <div className="commit-header">
                  {selectedBranch && <span className="commit-header-label">{selectedBranch}</span>}
                  <span className="commit-header-count">{t('commit.count', { count: commitsTotal })}</span>
                </div>
                <div className="commit-list">
                  {commitsLoading ? (
                    <p className="commit-status">{t('commit.loading')}</p>
                  ) : commits.length === 0 ? (
                    <p className="commit-status">{t('commit.empty')}</p>
                  ) : (
                    commits.map((c) => (
                      <div key={c.hash} className="commit-item">
                        <div className="commit-content" onClick={() => handleToggleCommit(c.hash)}>
                          <div className={`commit-message${c.message.startsWith('Merge ') ? ' commit-message--merge' : ''}`}>{c.message}</div>
                          <div className="commit-meta">
                            <span className="commit-hash">{c.hash.slice(0, 7)}</span>
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
                    ))
                  )}
                </div>
                {!commitsLoading && commits.length > 0 && totalCommitPages > 1 && (
                  <div className="commit-pagination">
                    <button className="btn btn--small" disabled={commitPage <= 1} onClick={handlePrevPage}>{t('commit.prevPage')}</button>
                    <span className="commit-pagination-info">{commitPage} / {totalCommitPages}</span>
                    <button className="btn btn--small" disabled={commitPage >= totalCommitPages} onClick={handleNextPage}>{t('commit.nextPage')}</button>
                  </div>
                )}
              </>
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
