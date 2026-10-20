// 跟随宿主配色（DeepSeek Harness 插件模式）。
//
// 插件把 GitSeeable 放进右侧栏的 iframe 里，两个文档各自有独立的 CSS，
// 所以 iframe 里的页面无法直接继承宿主的主题变量。这里的桥接分两步：
//   1. 挂载 URL 带 `?theme=dark|light`，用于首帧就画对，避免白闪；
//   2. 之后宿主切换主题时用 postMessage 实时推送，不重载整页。
// 独立运行（直接在浏览器里打开）时这三件事都不成立，配色仍由界面按钮控制。
export type ColorScheme = 'light' | 'dark';

/** 宿主推送配色用的消息类型，必须与 dsh-plugin/lib/client.js 一致。 */
export const THEME_MESSAGE_TYPE = 'gitseeable:theme';

/** 页面就绪通告：宿主收到后立即补发当前配色，避免早于 onLoad 的消息丢失。 */
export const THEME_READY_TYPE = 'gitseeable:ready';

function asScheme(value: unknown): ColorScheme | null {
  return value === 'dark' || value === 'light' ? value : null;
}

/** 是否作为嵌入页面运行（DSH 右侧栏里的 iframe）。 */
export function isEmbedded(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.parent !== window;
  } catch {
    // 跨域访问 parent 会抛错，那也说明确实被嵌入了
    return true;
  }
}

/** 读取宿主在挂载 URL 里播种的配色；独立运行返回 null。 */
export function readSeededTheme(): ColorScheme | null {
  if (typeof window === 'undefined') return null;
  return asScheme(new URLSearchParams(window.location.search).get('theme'));
}

/** 从一条 postMessage 载荷里取出配色；不是本协议的消息返回 null。 */
export function parseThemeMessage(data: unknown): ColorScheme | null {
  if (data === null || typeof data !== 'object') return null;
  const payload = data as { type?: unknown; theme?: unknown };
  if (payload.type !== THEME_MESSAGE_TYPE) return null;
  return asScheme(payload.theme);
}

/** 通告父窗口「我已就绪」，请它补发当前配色。 */
export function announceThemeReady(): void {
  if (!isEmbedded()) return;
  try {
    window.parent.postMessage({ type: THEME_READY_TYPE }, '*');
  } catch {
    // 父窗口可能已经关闭，配色跟随不是关键路径
  }
}
