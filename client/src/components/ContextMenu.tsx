import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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

/** 菜单与视口边缘的最小间距 */
const EDGE_MARGIN = 8;

interface MenuPosition {
  x: number;
  y: number;
  flipX: boolean;
  flipY: boolean;
}

function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<MenuPosition | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // 先按鼠标位置渲染（隐藏），量到真实尺寸后再决定是否需要翻转
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;

    const width = el.offsetWidth;
    const height = el.offsetHeight;
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;

    let left = x;
    let top = y;
    let flipX = false;
    let flipY = false;

    // 下方空间不足 → 翻转到鼠标上方
    if (top + height + EDGE_MARGIN > viewportH) {
      const flipped = y - height;
      if (flipped >= EDGE_MARGIN) {
        top = flipped;
        flipY = true;
      } else {
        top = Math.max(EDGE_MARGIN, viewportH - height - EDGE_MARGIN);
      }
    }

    // 右侧空间不足 → 翻转到鼠标左侧
    if (left + width + EDGE_MARGIN > viewportW) {
      const flipped = x - width;
      if (flipped >= EDGE_MARGIN) {
        left = flipped;
        flipX = true;
      } else {
        left = Math.max(EDGE_MARGIN, viewportW - width - EDGE_MARGIN);
      }
    }

    setPos({ x: left, y: top, flipX, flipY });
  }, [x, y, items.length]);

  const menuStyle = {
    '--menu-x': (pos?.x ?? x) + 'px',
    '--menu-y': (pos?.y ?? y) + 'px',
    visibility: pos ? 'visible' : 'hidden',
    transformOrigin: `${pos?.flipY ? 'bottom' : 'top'} ${pos?.flipX ? 'right' : 'left'}`,
  } as React.CSSProperties;

  return (
    <>
      <div className="context-menu-backdrop" onClick={onClose} />
      <div ref={menuRef} className="context-menu" style={menuStyle}>
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
