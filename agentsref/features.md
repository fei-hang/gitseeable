# Implemented Features

- **Theme toggle**: Light/dark mode persisted to `state.json`, sun/moon button in both headers, all hardcoded colors replaced with CSS variables.
- **Branch graph**: `POST /api/commit-graph` returns `git log --graph` with pagination. Frontend renders colored ASCII lanes (8-color palette) with connector-only rows for topology. Optional `branch` param filters to specific branch instead of `--all`.
- **Local changes tab**: Status → stage/unstage/restore flow. `POST /api/local-status` filters out pure directories. Untracked files excluded from restore API (shows skip count in confirm dialog).
- **Side-by-side diff**: Virtual scroll (ROW_HEIGHT = 20px, ±20 buffer) for performance. Draggable split pane divider between original/modified columns.
- **Commit list pagination**: Page size selector (10/20/50/100/200), go-to-page input with Enter support. `POST /api/commits` supports `pageSize <= 0` for no limit.
- **Merge & rebase**: `POST /api/merge-branch` and `POST /api/rebase-branch` (two-arg form). Post-operation graph reloads.
- **Remote branch checkout**: Branches with `/` auto-create local tracking branch (`--track`).
- **Checkout conflict detection**: Error string `'would be overwritten by checkout'` triggers i18n key `dialog.checkoutConflict`.
- **Branch graph filtering**: Double-click branch name → reloads graph filtered by that branch. Click branch label → resets to show all branches.
