import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchConflictFileContent, abortMerge } from '../api';
import './ConflictResolver.css';

const ROW_HEIGHT = 20;

export default function ConflictResolver({ currentPath, conflictFiles, conflictType, onAbort, onRefresh }) {
  const { t } = useTranslation();
  const [selectedFile, setSelectedFile] = useState(null);
  const [ours, setOurs] = useState('');
  const [theirs, setTheirs] = useState('');
  const [loading, setLoading] = useState(false);
  const [aborting, setAborting] = useState(false);

  const [oursSplitPct, setOursSplitPct] = useState(0.5);
  const splitDragging = useRef(false);

  const handleSelectFile = useCallback(async (file) => {
    setSelectedFile(file);
    setLoading(true);
    try {
      const data = await fetchConflictFileContent(currentPath, file);
      setOurs(data.ours || '');
      setTheirs(data.theirs || '');
    } catch (_) {
      setOurs('');
      setTheirs('');
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

  const handleSplitMouseDown = useCallback((e) => {
    e.preventDefault();
    splitDragging.current = true;
    const body = e.currentTarget.parentElement;
    const onMove = (ev) => {
      if (!splitDragging.current) return;
      const rect = body.getBoundingClientRect();
      const pct = Math.max(0.15, Math.min(0.85, (ev.clientX - rect.left) / rect.width));
      setOursSplitPct(pct);
    };
    const onUp = () => { splitDragging.current = false; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

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
                <div className="conflict-diff-label" style={{ width: `${oursSplitPct * 100}%`, flex: 'none' }}>{t('conflict.ours')}</div>
                <div className="conflict-diff-label">{t('conflict.theirs')}</div>
              </div>
              <div className="conflict-diff-body" style={{ '--left-pct': `${oursSplitPct * 100}%` }}>
                <div className="diff-handle" onMouseDown={handleSplitMouseDown} />
                <div style={{ height: maxLines * ROW_HEIGHT }}>
                  {Array.from({ length: maxLines }).map((_, i) => (
                    <div key={i} className="conflict-diff-row">
                      <div className="conflict-diff-cell">
                        <span className="diff-line-num">{i + 1}</span>
                        <span className="diff-line-content">{oursLines[i] || ''}</span>
                      </div>
                      <div className="conflict-diff-cell">
                        <span className="diff-line-num">{i + 1}</span>
                        <span className="diff-line-content">{theirsLines[i] || ''}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
