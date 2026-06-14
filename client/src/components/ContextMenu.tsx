import './ContextMenu.css';

interface ContextMenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
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
            className={`context-menu-item${item.danger ? ' context-menu-item--danger' : ''}`}
            onClick={() => { item.onClick(); onClose(); }}
          >
            {item.label}
          </div>
        ))}
      </div>
    </>
  );
}

export default ContextMenu;
