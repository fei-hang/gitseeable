import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MAX_VISIBLE_BRANCHES } from '../constants';
import './BranchList.css';

function BranchList({ title, branches, currentBranch, selectedBranch, onSelect, onDoubleClick, onContextMenuOpen }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const sorted = [...branches].sort((a, b) => {
    if (a === currentBranch) return -1;
    if (b === currentBranch) return 1;
    return 0;
  });

  const visible = expanded ? sorted : sorted.slice(0, MAX_VISIBLE_BRANCHES);
  const hasMore = sorted.length > MAX_VISIBLE_BRANCHES;

  return (
    <div className="branch-panel">
      <h3 className="branch-panel-title" onClick={() => setExpanded(!expanded)}>
        {title} ({branches.length}) {hasMore ? (expanded ? '▲' : '▼') : ''}
      </h3>
      <div className="branch-panel-list">
        {visible.map((branch, index) => (
          <div
            key={index}
            className={`branch-item${branch === selectedBranch ? ' branch-item--selected' : ''}${branch === currentBranch ? ' branch-item--current' : ''}`}
            onClick={() => onSelect(branch)}
            onDoubleClick={() => onDoubleClick?.(branch)}
            onContextMenu={(e) => onContextMenuOpen(e, branch)}
          >
            <span className="branch-icon">{branch === currentBranch ? '●' : '○'}</span>
            <span className="branch-name">{branch}</span>
          </div>
        ))}
        {hasMore && !expanded && (
          <div className="branch-more" onClick={() => setExpanded(true)}>
            {t('branch.more', { count: sorted.length - MAX_VISIBLE_BRANCHES })}
          </div>
        )}
      </div>
    </div>
  );
}

export default BranchList;
