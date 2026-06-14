# Frontend Conventions

- **CSS**: Design tokens in `client/src/index.css` (`:root` variables), plain `.css` files, BEM-like naming: `btn--primary`, `branch-item--selected`. Context menu positioning via `--menu-x`/`--menu-y` CSS custom properties.
- **i18n**: i18next + react-i18next. Default locale is `zh`. Keys use dot notation. Files in `client/src/locales/{zh,en}.json`.
- **Components**: Functional + hooks, `handle*` event handlers, one file per component, no PropTypes.
- **Sidebar**: Resizable via drag handle (min-width 80px). Commit items expandable: click commit → files list → click file → per-file diff.
- **Dangerous actions**: Context menu `danger` boolean property styles destructive ops red.

# Key Conventions

- CSS variables in `index.css` (`:root` + `[data-theme="dark"]`). BEM naming. `--menu-x`/`--menu-y` for context menu positioning.
- Frontend spells skill as `ui-design-system` (not `ui-new`).
- Graph rendering uses 8 fixed lane colors, char-by-char coloring based on position in graph string.
- Virtual scroll `ResizeObserver` effect has empty deps — observes once on mount.
