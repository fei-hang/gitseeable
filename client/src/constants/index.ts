// API 前缀由当前文档路径反推，避免写死：
// - 独立运行：前端挂在服务器根 → 前缀 '' → 请求 /api/...
// - 作为 DSH 插件嵌入：前端挂在 /gitseeable/ 下 → 前缀 '/gitseeable' → 请求 /gitseeable/api/...
// 这样同一份构建产物两种宿主都能用，也不会把请求打到 DSH 自己的 /api。
function resolveApiBaseUrl(): string {
  if (typeof window === 'undefined') return '';
  const pathname = window.location.pathname.replace(/\/index\.html$/, '');
  return pathname.replace(/\/+$/, '');
}

const API_BASE_URL = resolveApiBaseUrl();

const MAX_VISIBLE_BRANCHES = 10;
const COMMITS_PAGE_SIZE = 50;
const MAX_DIRECTORIES = 200;

export { API_BASE_URL, MAX_VISIBLE_BRANCHES, COMMITS_PAGE_SIZE, MAX_DIRECTORIES };
