import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MAX_VISIBLE_BRANCHES } from '../constants';
import './BranchList.css';

interface BranchItem {
  name: string;
  ahead?: number;
  behind?: number;
}

interface BranchListProps {
  title: string;
  branches: (string | BranchItem)[];
  currentBranch: string;
  selectedBranch: string | null;
  onSelect: (branch: string) => void;
  onDoubleClick?: (branch: string) => void;
  onContextMenuOpen: (e: React.MouseEvent, branch: string) => void;
}

function BranchList({ title, branches, currentBranch, selectedBranch, onSelect, onDoubleClick, onContextMenuOpen }: BranchListProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const getName = (b: string | BranchItem): string => (typeof b === 'string' ? b : b.name);

  const sorted = [...branches].sort((a, b) => {
    const na = getName(a), nb = getName(b);
    if (na === currentBranch) return -1;
    if (nb === currentBranch) return 1;
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
        {visible.map((branch, index) => {
          const name = getName(branch);
          const ahead = typeof branch === 'object' ? branch.ahead : 0;
          const behind = typeof branch === 'object' ? branch.behind : 0;
          return (
            <div
              key={index}
              className={`branch-item${name === selectedBranch ? ' branch-item--selected' : ''}${name === currentBranch ? ' branch-item--current' : ''}`}
              onClick={() => onSelect(name)}
              onDoubleClick={() => onDoubleClick?.(name)}
              onContextMenu={(e) => onContextMenuOpen(e, name)}
            >
              <span className="branch-icon">{name === currentBranch ? '●' : '○'}</span>
              <span className="branch-name">{name}</span>
              {ahead !== undefined && ahead > 0 && <span className="branch-arrow branch-arrow--up" title={t('branch.ahead', { count: ahead })}>▲</span>}
              {behind !== undefined && behind > 0 && <span className="branch-arrow branch-arrow--down" title={t('branch.behind', { count: behind })}>▼</span>}
            </div>
          );
        })}
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
