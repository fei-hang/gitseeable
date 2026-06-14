# API Endpoints

All in `server/index.ts` (~1020 lines, with type annotations). REST: `GET /api/drives`, remainder are `POST` calls.

| Endpoint | Purpose |
|---|---|
| `POST /api/commits` | Get commit list for a ref |
| `POST /api/branches` | List branches (current + all) |
| `POST /api/checkout` | Checkout branch or create-and-checkout |
| `POST /api/branch` | Create / rename / delete branch |
| `POST /api/commit-files` | List changed files in a commit |
| `POST /api/commit-file-diff` | Get per-file diff (only +/- lines, no metadata) |
| `POST /api/commit-graph` | Git log --graph with pagination, optional `branch` filter |
| `POST /api/merge-branch` | Git merge a branch into current |
| `POST /api/rebase-branch` | Git rebase (single-arg form: `git rebase <target>`, rebases current branch onto target) |
| `POST /api/local-status` | Git status --porcelain (filters out pure directories) |
| `POST /api/local-commit` | Git add + git commit |
| `POST /api/local-stage` | Git add individual files |
| `POST /api/local-unstage` | Git restore --staged |
| `POST /api/local-restore` | Git checkout/restore for files |
| `POST /api/local-file-diff` | Git diff for a specific file |
| `GET /api/drives` | Windows drive enumeration |
