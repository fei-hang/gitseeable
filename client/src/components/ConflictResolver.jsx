import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchConflictFileContent, abortMerge } from '../api';
import './ConflictResolver.css';

export default function ConflictResolver({ currentPath, conflictFiles, conflictType, onAbort, onRefresh }) {
  const { t } = useTranslation();
  const [selectedFile, setSelectedFile] = useState(null);
  const [ours, setOurs] = useState('');
  const [theirs, setTheirs] = useState('');
  const [loading, setLoading] = useState(false);
  const [aborting, setAborting] = useState(false);
  const [conflictLines, setConflictLines] = useState(new Set());

  const handleSelectFile = useCallback(async (file) => {
    setSelectedFile(file);
    setLoading(true);
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

  const handleAbort = async () => {
    setAborting(true);
    try {
      await abortMerge(currentPath);
      onAbort();
    } catch (_) {
      setAborting(false);
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
  const maxLines = Math.max(oursLines.length, theirsLines.length);

  return (
    <div className="conflict-view">
      <div className="conflict-header">
        <span className="conflict-title">{conflictType === 'merge' ? t('conflict.titleMerge') : t('conflict.titleRebase')}</span>
        <span className="conflict-file-count">{t('conflict.fileCount', { count: conflictFiles.length })}</span>
        <div className="conflict-header-actions">
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
                <div className="conflict-diff-label">{t('conflict.ours')}</div>
                <div className="conflict-diff-label">{t('conflict.theirs')}</div>
              </div>
              <div className="conflict-diff-body">
                <div className="conflict-diff-rows">
                  {Array.from({ length: maxLines }).map((_, i) => {
                    const isConflict = conflictLines.has(i);
                    return (
                      <div key={i} className={`conflict-diff-row${isConflict ? ' conflict-diff-row--diff' : ''}`}>
                        <div className="conflict-diff-cell">
                          <span className="diff-line-num">{i + 1}</span>
                          <span className="diff-line-content">{oursLines[i] || ''}</span>
                        </div>
                        <div className="conflict-diff-cell">
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
