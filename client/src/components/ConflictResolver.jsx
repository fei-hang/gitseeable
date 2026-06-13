import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchConflictFileContent, abortMerge, resolveConflictFile } from '../api';
import './ConflictResolver.css';

export default function ConflictResolver({ currentPath, currentBranch, conflictFiles, conflictType, theirsBranch, onAbort, onRefresh, onFileResolved }) {
  const { t } = useTranslation();
  const [selectedFile, setSelectedFile] = useState(null);
  const [ours, setOurs] = useState('');
  const [theirs, setTheirs] = useState('');
  const [hunks, setHunks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [aborting, setAborting] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [resolvingAll, setResolvingAll] = useState(false);
  const [selectionsByFile, setSelectionsByFile] = useState({});
  const loadedContent = useRef({});

  const storageKey = `conflict-selections-${currentPath}`;

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        setSelectionsByFile(JSON.parse(saved));
      }
    } catch (_) {}
  }, [storageKey]);

  useEffect(() => {
    if (Object.keys(selectionsByFile).length > 0) {
      localStorage.setItem(storageKey, JSON.stringify(selectionsByFile));
    }
  }, [selectionsByFile, storageKey]);

  const currentSelections = (selectedFile && selectionsByFile[selectedFile]) || {};

  const handleSelectFile = useCallback(async (file) => {
    setSelectedFile(file);
    if (loadedContent.current[file]) {
      const c = loadedContent.current[file];
      setOurs(c.ours);
      setTheirs(c.theirs);
      setHunks(c.hunks);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchConflictFileContent(currentPath, file);
      loadedContent.current[file] = { ours: data.ours || '', theirs: data.theirs || '', hunks: data.hunks || [] };
      setOurs(data.ours || '');
      setTheirs(data.theirs || '');
      setHunks(data.hunks || []);
    } catch (_) {
      loadedContent.current[file] = { ours: '', theirs: '', hunks: [] };
      setOurs('');
      setTheirs('');
      setHunks([]);
    } finally {
      setLoading(false);
    }
  }, [currentPath]);

  const rows = useMemo(() => {
    const oLines = ours.split('\n');
    const tLines = theirs.split('\n');
    const result = [];
    let rowIdx = 0;
    for (const hunk of hunks) {
      const maxRows = Math.max(hunk.ourCount, hunk.theirCount);
      for (let j = 0; j < maxRows; j++) {
        result.push({
          rowIdx: rowIdx++,
          ourLineNum: j < hunk.ourCount ? hunk.ourStart + j : null,
          ourContent: j < hunk.ourCount ? (oLines[hunk.ourStart - 1 + j] || '') : '',
          theirLineNum: j < hunk.theirCount ? hunk.theirStart + j : null,
          theirContent: j < hunk.theirCount ? (tLines[hunk.theirStart - 1 + j] || '') : '',
        });
      }
    }
    return result;
  }, [ours, theirs, hunks]);

  const handleCellClick = useCallback((rowIdx, side) => {
    setSelectionsByFile(prev => {
      const fileSelections = { ...(prev[selectedFile] || {}) };
      const cur = fileSelections[rowIdx];
      if (!cur) {
        fileSelections[rowIdx] = { ours: side === 'ours', theirs: side === 'theirs', first: side };
      } else if (cur[side]) {
        const next = { ...cur, [side]: false };
        const other = side === 'ours' ? 'theirs' : 'ours';
        if (next.ours || next.theirs) {
          next.first = next[other] ? (next.first === side ? other : next.first) : null;
        } else {
          next.first = null;
        }
        if (!next.ours && !next.theirs) {
          delete fileSelections[rowIdx];
        } else {
          fileSelections[rowIdx] = next;
        }
      } else {
        fileSelections[rowIdx] = { ...cur, [side]: true };
      }
      return { ...prev, [selectedFile]: fileSelections };
    });
  }, [selectedFile]);

  const handleAbort = async () => {
    setAborting(true);
    try {
      await abortMerge(currentPath);
      localStorage.removeItem(storageKey);
      onAbort();
    } catch (_) {
      setAborting(false);
    }
  };

  const buildResolvedContent = useCallback((fileOurs, fileTheirs, fileHunks, fileSelections) => {
    const oLines = fileOurs.split('\n');
    const tLines = fileTheirs.split('\n');
    const result = [];
    let ourPos = 0;
    let rowIdx = 0;

    for (const hunk of fileHunks) {
      while (ourPos < hunk.ourStart - 1) {
        result.push(oLines[ourPos]);
        ourPos++;
      }
      ourPos += hunk.ourCount;

      const maxRows = Math.max(hunk.ourCount, hunk.theirCount);
      for (let j = 0; j < maxRows; j++) {
        const sel = fileSelections[rowIdx++];
        const hasOurs = j < hunk.ourCount;
        const hasTheirs = j < hunk.theirCount;
        const ourLine = hasOurs ? (oLines[hunk.ourStart - 1 + j] || '') : '';
        const theirLine = hasTheirs ? (tLines[hunk.theirStart - 1 + j] || '') : '';

        if (sel?.ours && sel?.theirs) {
          if (sel.first === 'ours') {
            if (hasOurs) result.push(ourLine);
            if (hasTheirs) result.push(theirLine);
          } else {
            if (hasTheirs) result.push(theirLine);
            if (hasOurs) result.push(ourLine);
          }
        } else if (sel?.ours && hasOurs) {
          result.push(ourLine);
        } else if (sel?.theirs && hasTheirs) {
          result.push(theirLine);
        } else if (hasOurs) {
          result.push(ourLine);
        }
      }
    }

    while (ourPos < oLines.length) {
      result.push(oLines[ourPos]);
      ourPos++;
    }

    return result.join('\n');
  }, []);

  const handleResolve = async () => {
    setResolving(true);
    try {
      const content = buildResolvedContent(ours, theirs, hunks, currentSelections);
      await resolveConflictFile(currentPath, selectedFile, content);
      onFileResolved();
    } catch (_) {
      setResolving(false);
    }
  };

  const handleResolveAll = async () => {
    setResolvingAll(true);
    try {
      for (const file of conflictFiles) {
        let fileData = loadedContent.current[file];
        if (!fileData || !fileData.ours) {
          try {
            fileData = await fetchConflictFileContent(currentPath, file);
            loadedContent.current[file] = fileData;
          } catch (_) {
            continue;
          }
        }
        const fileSelections = selectionsByFile[file] || {};
        const content = buildResolvedContent(
          fileData.ours || '',
          fileData.theirs || '',
          fileData.hunks || [],
          fileSelections
        );
        await resolveConflictFile(currentPath, file, content);
      }
      localStorage.removeItem(storageKey);
      onFileResolved();
    } catch (_) {
      setResolvingAll(false);
    }
  };

  useEffect(() => {
    if (conflictFiles && conflictFiles.length > 0 && !selectedFile) {
      setSelectedFile(conflictFiles[0]);
    }
  }, [conflictFiles, selectedFile]);

  useEffect(() => {
    if (selectedFile) {
      handleSelectFile(selectedFile);
    }
  }, [selectedFile, handleSelectFile]);

  const allResolved = rows.length > 0 && rows.every(r => {
    const sel = currentSelections[r.rowIdx];
    return sel?.ours || sel?.theirs;
  });

  return (
    <div className="conflict-view">
      <div className="conflict-header">
        <span className="conflict-title">{conflictType === 'merge' ? t('conflict.titleMerge') : t('conflict.titleRebase')}</span>
        <span className="conflict-file-count">{t('conflict.fileCount', { count: conflictFiles.length })}</span>
        <div className="conflict-header-actions">
          <button className="btn btn--primary" disabled={!allResolved || resolving} onClick={handleResolve}>
            {resolving ? t('common.loading') : t('conflict.resolve')}
          </button>
          <button className="btn btn--primary" disabled={conflictFiles.length === 0 || resolvingAll} onClick={handleResolveAll}>
            {resolvingAll ? t('common.loading') : t('conflict.resolveAll')}
          </button>
          <button className="btn btn--danger" disabled={aborting} onClick={handleAbort}>
            {aborting ? t('common.loading') : (conflictType === 'merge' ? t('conflict.abortMerge') : t('conflict.abortRebase'))}
          </button>
        </div>
      </div>
      <div className="conflict-body">
        <div className="conflict-file-list">
          {conflictFiles.map((f) => {
            const fileSelections = selectionsByFile[f];
            const hasSelections = fileSelections && Object.keys(fileSelections).length > 0;
            return (
              <div
                key={f}
                className={`conflict-file-item${selectedFile === f ? ' conflict-file-item--selected' : ''}${hasSelections ? ' conflict-file-item--resolved' : ''}`}
                onClick={() => setSelectedFile(f)}
              >
                <span className="conflict-file-icon">{hasSelections ? '✓' : '!'}</span>
                <span className="conflict-file-path">{f}</span>
              </div>
            );
          })}
        </div>
        <div className="conflict-resize-handle" />
        <div className="conflict-diff-area">
          {!selectedFile ? (
            <div className="conflict-diff-empty">{t('conflict.selectFile')}</div>
          ) : loading ? (
            <div className="conflict-diff-loading">{t('common.loading')}</div>
          ) : rows.length === 0 ? (
            <div className="conflict-diff-empty">{t('common.loading')}</div>
          ) : (
            <div className="conflict-diff-view">
              <div className="conflict-diff-header">
                <div className="conflict-diff-label">{currentBranch || t('conflict.ours')}</div>
                <div className="conflict-diff-label">{theirsBranch || t('conflict.theirs')}</div>
              </div>
              <div className="conflict-diff-body">
                <div className="conflict-diff-rows">
                  {rows.map((r, idx) => {
                    const sel = currentSelections[r.rowIdx];
                    const oursSel = sel?.ours || false;
                    const theirsSel = sel?.theirs || false;
                    const oursLater = oursSel && theirsSel && sel.first !== 'ours';
                    const theirsLater = oursSel && theirsSel && sel.first !== 'theirs';
                    return (
                      <React.Fragment key={r.rowIdx}>
                        <div className="conflict-diff-row conflict-diff-row--diff">
                          <div
                            className={`conflict-diff-cell${oursSel ? (oursLater ? ' conflict-diff-cell--selected-later' : ' conflict-diff-cell--selected-ours') : ''}`}
                            onClick={() => handleCellClick(r.rowIdx, 'ours')}
                          >
                            <span className="diff-line-num">{r.ourLineNum !== null ? r.ourLineNum : ''}</span>
                            <span className="diff-line-content">{r.ourContent}</span>
                          </div>
                          <div
                            className={`conflict-diff-cell${theirsSel ? (theirsLater ? ' conflict-diff-cell--selected-later' : ' conflict-diff-cell--selected-theirs') : ''}`}
                            onClick={() => handleCellClick(r.rowIdx, 'theirs')}
                          >
                            <span className="diff-line-num">{r.theirLineNum !== null ? r.theirLineNum : ''}</span>
                            <span className="diff-line-content">{r.theirContent}</span>
                          </div>
                        </div>
                        {idx < rows.length - 1 && <div className="conflict-row-separator" />}
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
