import './ContextMenu.css';

function ContextMenu({ x, y, items, onClose }) {
  return (
    <>
      <div className="context-menu-backdrop" onClick={onClose} />
      <div
        className="context-menu"
        style={{ '--menu-x': x + 'px', '--menu-y': y + 'px' }}
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
