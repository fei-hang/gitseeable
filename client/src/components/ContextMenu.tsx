import { useEffect } from 'react';
import './ContextMenu.css';

interface ContextMenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <>
      <div className="context-menu-backdrop" onClick={onClose} />
      <div
        className="context-menu"
        style={{ '--menu-x': x + 'px', '--menu-y': y + 'px' } as React.CSSProperties}
      >
        {items.map((item, i) => (
          <div
            key={i}
            className={`context-menu-item${item.danger ? ' context-menu-item--danger' : ''}${item.disabled ? ' context-menu-item--disabled' : ''}`}
            onClick={() => { if (!item.disabled) { item.onClick(); onClose(); } }}
          >
            {item.label}
          </div>
        ))}
      </div>
    </>
  );
}

export default ContextMenu;
