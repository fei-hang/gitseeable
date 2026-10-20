/**
 * GitSeeable for DeepSeek Harness — the browser half.
 *
 * Registers one right-Sidebar tab type whose body is the GitSeeable SPA served
 * by this same package's host half, plus one guide entry, so the type shows up
 * as a capsule on the right Sidebar's Start page (「开始」). Nothing here reaches
 * a model request; the tab is user-side presentation only.
 *
 * Hand-written factory-form bundle (no build step): running the script only
 * registers the factory, so React and the markup below materialize on first
 * import.
 */
window.__ModuleLoader__.load({
  id: 'dsh-gitseeable',
  factory: (require) => {
    const React = require('react');
    const createElement = React.createElement;

    /** Cordis fiber services: slot registry, copy, and the right Sidebar's two registries. */
    const inject = ['slots', 'locale', 'sidebarRight', 'sidebarRightTabs'];

    /** Copy namespace owned by this plugin. */
    const NS = 'gitseeable';

    /** This implementation's identity in the tab system (unique per registration). */
    const TAB_ID = 'dsh-gitseeable';

    /** The tab kind the guide entry opens. */
    const KIND = 'gitseeable';

    /** Fixed, prefix-independent discovery endpoint served by the host half. */
    const DISCOVERY_PATH = '/_gitseeable/mount.json';

    /** The prefix the patch row uses; discovery wins when a deployment moves it. */
    const DEFAULT_BASE_PATH = '/gitseeable';

    /** Simplified Chinese dictionary (the key-set source of truth). */
    const zh = {
      'type.label': 'GitSeeable',
      'guide.title': 'GitSeeable',
      'guide.description': '可视化浏览 Git 仓库',
      connecting: '正在连接 GitSeeable…',
      unavailable: '打不开 GitSeeable 页面。',
      'unavailable.detail': '插件的宿主路由没有响应，请确认 dsh-gitseeable 已启用后重试。',
      retry: '重试',
      'shortcut.noSession': '请先打开一个会话',
    };

    /** English dictionary, checked against the Chinese key set. */
    const en = {
      'type.label': 'GitSeeable',
      'guide.title': 'GitSeeable',
      'guide.description': 'Browse Git repositories visually',
      connecting: 'Connecting to GitSeeable…',
      unavailable: 'The GitSeeable page could not open.',
      'unavailable.detail': 'The plugin’s host route did not answer. Make sure dsh-gitseeable is enabled, then retry.',
      retry: 'Retry',
      'shortcut.noSession': 'Open a session first',
    };

    /** Git-branch glyph for the guide capsule and the tab chip. */
    function GitBranchIcon(props) {
      const size = props && props.size !== undefined ? props.size : 16;
      return createElement('svg', {
        width: size,
        height: size,
        viewBox: '0 0 16 16',
        fill: 'none',
        className: props ? props.className : undefined,
        'aria-hidden': 'true',
      },
      createElement('circle', { cx: '4', cy: '3.2', r: '1.9', stroke: 'currentColor', strokeWidth: '1.3' }),
      createElement('circle', { cx: '4', cy: '12.8', r: '1.9', stroke: 'currentColor', strokeWidth: '1.3' }),
      createElement('circle', { cx: '12', cy: '5.4', r: '1.9', stroke: 'currentColor', strokeWidth: '1.3' }),
      createElement('path', { d: 'M4 5.1v5.8', stroke: 'currentColor', strokeWidth: '1.3', strokeLinecap: 'round' }),
      createElement('path', { d: 'M12 7.3v1.2a3 3 0 0 1-3 3H4', stroke: 'currentColor', strokeWidth: '1.3', strokeLinecap: 'round' }));
    }

    /**
     * Ask the host half where it mounted GitSeeable. A deployment may move the
     * prefix, so this fixed path is the only address the two halves share.
     * @returns the prefix, absolute, without a trailing slash.
     */
    async function discoverBasePath() {
      try {
        const response = await fetch(DISCOVERY_PATH, { headers: { accept: 'application/json' } });
        if (response.ok) {
          const body = await response.json();
          if (body !== null && typeof body === 'object' && typeof body.basePath === 'string' && body.basePath !== '') {
            return body.basePath.replace(/\/+$/, '');
          }
        }
      } catch {
        // The route is missing or the request was blocked; the patch row's default still names the mount.
      }
      return DEFAULT_BASE_PATH;
    }

    /**
     * The type's registry definition: one page type with one Start-page entry.
     * @param t - namespace-bound translate, read fresh on every label call.
     * @returns the definition to register.
     */
    function definition(t) {
      return {
        id: TAB_ID,
        kind: KIND,
        priority: 'builtin',
        title: () => t('type.label'),
        guide: [{
          id: 'open',
          order: 40,
          title: () => t('guide.title'),
          description: () => t('guide.description'),
          icon: GitBranchIcon,
        }],
      };
    }

    /** Full-pane error state with a retry that remounts the frame. */
    function Unavailable(props) {
      return createElement('div', {
        style: {
          display: 'flex', flex: 1, minHeight: 0, flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24, textAlign: 'center',
        },
      },
      createElement('p', { style: { margin: 0, fontWeight: 600 } }, props.title),
      createElement('p', { style: { margin: 0, opacity: 0.65, fontSize: 13, lineHeight: 1.5, maxWidth: 320 } }, props.detail),
      createElement('button', {
        type: 'button',
        onClick: props.onRetry,
        style: {
          marginTop: 8, padding: '6px 14px', borderRadius: 8, cursor: 'pointer',
          border: '1px solid currentColor', background: 'transparent', color: 'inherit', font: 'inherit',
        },
      }, props.retry));
    }

    /**
     * The tab body: one iframe over the GitSeeable SPA at the discovered prefix,
     * seeded with the session's workspace so it opens that repository directly.
     */
    function GitSeeableBody(props) {
      const useTabInfo = props.useTabInfo;
      const useSessions = props.useSessions;
      const sessionId = props.sessionId;
      const t = props.t;

      const tabInfo = useTabInfo();
      const tab = tabInfo.tab;
      const tabId = tab.id;
      const tabActions = tab.actions;
      // The standard kit always supplies useSessions in the Web composition; a
      // host without it still gets a working tab, just not workspace-seeded.
      const workspaceCwd = typeof useSessions === 'function'
        ? useSessions(function selectCwd(state) {
          const summary = state && state.byId ? state.byId[sessionId] : undefined;
          return summary === undefined ? undefined : summary.cwd;
        })
        : undefined;

      // Capture the Workspace once: a later cwd change must not yank the frame
      // out from under whatever the user is browsing.
      const initialDir = React.useRef(workspaceCwd);
      const [basePath, setBasePath] = React.useState(null);
      const [epoch, setEpoch] = React.useState(0);
      const [failed, setFailed] = React.useState(false);

      React.useEffect(function discover() {
        let live = true;
        discoverBasePath().then(function adopt(path) { if (live) setBasePath(path); });
        return function release() { live = false; };
      }, []);

      const retry = React.useCallback(function retry() {
        setFailed(false);
        setEpoch(function next(value) { return value + 1; });
      }, []);

      // The Sidebar's refresh command reloads this page instead of the app.
      React.useEffect(function bindCommands() {
        return tabActions.bindCommands({ refresh: retry });
      }, [tabActions, retry]);

      const src = React.useMemo(function buildSrc() {
        if (basePath === null) return null;
        const dir = initialDir.current;
        return typeof dir === 'string' && dir !== ''
          ? basePath + '/?dir=' + encodeURIComponent(dir)
          : basePath + '/';
      }, [basePath]);

      if (src === null) {
        return createElement('div', {
          style: { display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', opacity: 0.6, fontSize: 13 },
        }, t('connecting'));
      }

      const frame = failed
        ? createElement(Unavailable, {
          title: t('unavailable'),
          detail: t('unavailable.detail'),
          retry: t('retry'),
          onRetry: retry,
        })
        : createElement('iframe', {
          key: src + '#' + String(epoch),
          src: src,
          title: t('type.label'),
          // Same posture as the shipped Browser tab: scripts and forms run, and
          // the frame keeps its own origin so its same-origin API calls work.
          sandbox: 'allow-scripts allow-forms allow-same-origin allow-popups allow-popups-to-escape-sandbox',
          onError: function onFrameError() { setFailed(true); },
          style: { flex: 1, minHeight: 0, width: '100%', border: 0, background: '#fff' },
        }, 'gitseeable-frame');

      // The tab body's own element: the Sidebar gives the seat `height: 100%`,
      // and this wrapper turns that into a flex column the frame can fill.
      return createElement('div', {
        'data-gitseeable-tab': tabId,
        style: { display: 'flex', flex: 1, minHeight: 0, flexDirection: 'column' },
      }, frame);
    }

    /** The tab chip: git glyph plus the title captured when the tab opened. */
    function GitSeeableTitle(props) {
      const tabInfo = props.useTabInfo();
      return createElement(React.Fragment, null,
        createElement(GitBranchIcon, { size: 14 }),
        tabInfo.tab.title);
    }

    /**
     * Client plugin body: dictionaries, the tab type, its body, its chip, and a
     * shortcut that lands the page in the focused dock pane.
     * @param ctx - client root context.
     */
    function apply(ctx) {
      const t = ctx.locale.bind(NS);

      ctx.effect(function registerCopy() {
        return ctx.locale.register(NS, { zh: zh, en: en });
      }, 'gitseeable: dictionaries');

      ctx.effect(function registerType() {
        return ctx.sidebarRightTabs.register(definition(t));
      }, 'gitseeable: tab type');

      ctx.effect(function registerBody() {
        return ctx.slots.inject('sidebar.right.pane.tab', function contribute() {
          return ctx.slots.register({
            name: 'sidebar.right.pane.tab',
            key: TAB_ID,
            locale: NS,
          }, GitSeeableBody);
        });
      }, 'gitseeable: tab body');

      ctx.effect(function registerTitle() {
        return ctx.slots.inject('sidebar.right.pane.tab.title', function contribute() {
          return ctx.slots.register({
            name: 'sidebar.right.pane.tab.title',
            key: TAB_ID,
            locale: NS,
          }, GitSeeableTitle);
        });
      }, 'gitseeable: tab title');

      ctx.inject(['shortcuts'], function installShortcut(scoped) {
        scoped.effect(function registerShortcut() {
          // A shortcut is a convenience, not the way in: the Start-page capsule
          // is. A host that already owns this chord (or ships no shortcut
          // service at all) must not take the tab type down with it.
          try {
            return scoped.shortcuts.register({
              id: 'gitseeable.open',
              label: function label() { return t('guide.title'); },
              aliases: ['gitseeable', 'git visualizer'],
              defaults: {
                'desktop:macos': { code: 'KeyG', modifiers: ['primary', 'shift'] },
                'desktop:windows': { code: 'KeyG', modifiers: ['primary', 'shift'] },
                'desktop:linux': { code: 'KeyG', modifiers: ['primary', 'shift'] },
                'web:macos': { code: 'KeyG', modifiers: ['primary', 'shift'] },
                'web:windows': { code: 'KeyG', modifiers: ['primary', 'shift'] },
              },
              regions: ['page', 'editable', 'terminal'],
              modals: [],
              resolve: function resolve(input) {
                const target = scoped.sidebarRight.commandTarget(input.target);
                if (target === undefined) return { status: 'blocked', reason: t('shortcut.noSession') };
                return {
                  status: 'handled',
                  run: function run() { scoped.sidebarRight.openTabFromTarget(KIND, target); },
                };
              },
            });
          } catch (error) {
            console.warn('[gitseeable] shortcut unavailable; use the Start-page entry instead:', error);
            return function noop() {};
          }
        }, 'gitseeable: shortcut');
      });
    }

    return { apply: apply, inject: inject };
  },
});
