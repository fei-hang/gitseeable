import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchConflictFileContent, abortMerge, resolveConflictFile } from '../api';
import './ConflictResolver.css';

export default function ConflictResolver({ currentPath, currentBranch, conflictFiles, conflictType, theirsBranch, onAbort, onRefresh, onFileResolved }) {
  const { t } = useTranslation();
  const [selectedFile, setSelectedFile] = useState(null);
  const [ours, setOurs] = useState('');
  const [theirs, setTheirs] = useState('');
  const [loading, setLoading] = useState(false);
  const [aborting, setAborting] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [conflictLines, setConflictLines] = useState(new Set());
  const [selections, setSelections] = useState({});

  const handleSelectFile = useCallback(async (file) => {
    setSelectedFile(file);
    setLoading(true);
    setSelections({});
    try {
      const data = await fetchConflictFileContent(currentPath, file);
      const o = data.ours || '';
      const t2 = data.theirs || '';
      setOurs(o);
      setTheirs(t2);
      const oLines = o.split('\n');
      const tLines = t2.split('\n');
      const diff = new Set();
      for (let i = 0; i < Math.max(oLines.length, tLines.length); i++) {
        if (oLines[i] !== tLines[i]) diff.add(i);
      }
      setConflictLines(diff);
    } catch (_) {
      setOurs('');
      setTheirs('');
      setConflictLines(new Set());
    } finally {
      setLoading(false);
    }
  }, [currentPath]);

  const handleCellClick = useCallback((lineIndex, side) => {
    setSelections(prev => {
      const cur = prev[lineIndex];
      if (!cur) {
        return { ...prev, [lineIndex]: { ours: side === 'ours', theirs: side === 'theirs', first: side } };
      }
      if (cur[side]) {
        const next = { ...cur, [side]: false };
        const other = side === 'ours' ? 'theirs' : 'ours';
        if (next.ours || next.theirs) {
          next.first = next[other] ? (next.first === side ? other : next.first) : null;
        } else {
          next.first = null;
        }
        if (!next.ours && !next.theirs) {
          const { [lineIndex]: _, ...rest } = prev;
          return rest;
        }
        return { ...prev, [lineIndex]: next };
      } else {
        return { ...prev, [lineIndex]: { ...cur, [side]: true } };
      }
    });
  }, []);

  const handleAbort = async () => {
    setAborting(true);
    try {
      await abortMerge(currentPath);
      onAbort();
    } catch (_) {
      setAborting(false);
    }
  };

  const handleResolve = async () => {
    setResolving(true);
    try {
      const oLines = ours.split('\n');
      const tLines = theirs.split('\n');
      const maxLen = Math.max(oLines.length, tLines.length);
      const result = [];
      for (let i = 0; i < maxLen; i++) {
        if (conflictLines.has(i)) {
          const sel = selections[i];
          if (sel?.ours && sel?.theirs) {
            if (sel.first === 'ours') {
              result.push(oLines[i] || '');
              result.push(tLines[i] || '');
            } else {
              result.push(tLines[i] || '');
              result.push(oLines[i] || '');
            }
          } else if (sel?.ours) {
            result.push(oLines[i] || '');
          } else if (sel?.theirs) {
            result.push(tLines[i] || '');
          }
        } else {
          result.push(oLines[i] || '');
        }
      }
      await resolveConflictFile(currentPath, selectedFile, result.join('\n'));
      onFileResolved();
    } catch (_) {
      setResolving(false);
    }
  };

  useEffect(() => {
    if (conflictFiles && conflictFiles.length > 0) {
      setSelectedFile(conflictFiles[0]);
    }
  }, [conflictFiles]);

  useEffect(() => {
    if (selectedFile) {
      handleSelectFile(selectedFile);
    }
  }, [selectedFile, handleSelectFile]);

  const oursLines = ours.split('\n');
  const theirsLines = theirs.split('\n');
  const conflictIndices = [...conflictLines].sort((a, b) => a - b);
  const allResolved = conflictIndices.length > 0 && conflictIndices.every(i => {
    const sel = selections[i];
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
          <button className="btn btn--danger" disabled={aborting} onClick={handleAbort}>
            {aborting ? t('common.loading') : (conflictType === 'merge' ? t('conflict.abortMerge') : t('conflict.abortRebase'))}
          </button>
        </div>
      </div>
      <div className="conflict-body">
        <div className="conflict-file-list">
          {conflictFiles.map((f) => (
            <div
              key={f}
              className={`conflict-file-item${selectedFile === f ? ' conflict-file-item--selected' : ''}`}
              onClick={() => setSelectedFile(f)}
            >
              <span className="conflict-file-icon">!</span>
              <span className="conflict-file-path">{f}</span>
            </div>
          ))}
        </div>
        <div className="conflict-resize-handle" />
        <div className="conflict-diff-area">
          {!selectedFile ? (
            <div className="conflict-diff-empty">{t('conflict.selectFile')}</div>
          ) : loading ? (
            <div className="conflict-diff-loading">{t('common.loading')}</div>
          ) : (
              <div className="conflict-diff-view">
              <div className="conflict-diff-header">
                <div className="conflict-diff-label">{currentBranch || t('conflict.ours')}</div>
                <div className="conflict-diff-label">{theirsBranch || t('conflict.theirs')}</div>
              </div>
              <div className="conflict-diff-body">
                <div className="conflict-diff-rows">
                  {conflictIndices.map((i) => {
                    const sel = selections[i];
                    const oursSel = sel?.ours || false;
                    const theirsSel = sel?.theirs || false;
                    const oursLater = oursSel && theirsSel && sel.first !== 'ours';
                    const theirsLater = oursSel && theirsSel && sel.first !== 'theirs';
                    return (
                      <div key={i} className="conflict-diff-row conflict-diff-row--diff">
                        <div
                          className={`conflict-diff-cell${oursSel ? (oursLater ? ' conflict-diff-cell--selected-later' : ' conflict-diff-cell--selected-ours') : ''}`}
                          onClick={() => handleCellClick(i, 'ours')}
                        >
                          <span className="diff-line-num">{i + 1}</span>
                          <span className="diff-line-content">{oursLines[i] || ''}</span>
                        </div>
                        <div
                          className={`conflict-diff-cell${theirsSel ? (theirsLater ? ' conflict-diff-cell--selected-later' : ' conflict-diff-cell--selected-theirs') : ''}`}
                          onClick={() => handleCellClick(i, 'theirs')}
                        >
                          <span className="diff-line-num">{i + 1}</span>
                          <span className="diff-line-content">{theirsLines[i] || ''}</span>
                        </div>
                      </div>
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
