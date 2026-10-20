# dsh-gitseeable

GitSeeable 的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
插件：在右侧栏的「开始」页新增一个入口，点开即可在本栏里浏览 Git 仓库。

## 它做了什么

- **主机侧**（`lib/index.js`）：把 GitSeeable 的 Express 应用挂到 `/gitseeable/`，
  再注册一个固定地址 `/_gitseeable/mount.json`，让浏览器端能发现挂载前缀。
- **浏览器侧**（`lib/client.js`）：向右侧栏注册一个 tab 类型，并在
  `sidebar.right.pane.tab` 的 guide（「开始」页）里贡献一个入口胶囊。

打开后是一个 iframe，指向 `/<前缀>/?dir=<当前会话的工作区>&theme=<亮/暗>`，
因此会直接定位到当前工作区的仓库；随后在 GitSeeable 里可以照常切换目录、扫描和浏览。

## 主题：跟随 DeepSeek Harness

页面配色**跟着 Harness 走**（亮对亮、暗对暗，包括「跟随系统」），插件里没有独立的
主题开关。两个文档各有自己的 CSS，iframe 无法继承宿主的变量，所以桥接分两条路：

| 时机 | 手段 |
|---|---|
| 首帧 | 挂载 URL 带 `?theme=dark\|light`，`client/index.html` 里的内联脚本在样式表之前把它写到 `<html>` 上，深色宿主里不会闪白 |
| 宿主切换主题 | `postMessage({ type: 'gitseeable:theme', theme })` 实时推送，不重载 iframe，不丢失当前浏览的仓库 |

宿主侧的配色来源有两个（互为备份）：`theme` 服务的 `theme/change` 事件，以及
`<body data-ds-dark-theme>` 属性的变化（Harness 的 ThemePresenter 就写在这里）。
弹窗、滚动条等原生控件也跟着走——页面会把 `color-scheme` 同步到 `<html>`。

页面还会在挂载和重新获得焦点时发一条 `gitseeable:ready`，让宿主补发当前配色，
避免切换发生得比 iframe 加载还早时丢失。

## 安装

先装配产物，再用**应用自带的 CLI** 安装：

```sh
npm run build:plugin
```

```sh
# 推荐：应用自带的启动器（已设好 ELECTRON_RUN_AS_NODE，等价于下面那条长命令）
"<安装目录>/resources/runtime/cli/bin/dsh.cmd" plugin --profile desktop add <包路径>

# 等价的展开写法
"<安装目录>/DeepSeek Harness.exe" --expose-internals \
  "<安装目录>/resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-desktop-host/lib/cli.js" \
  plugin --profile desktop add <包路径>
```

安装后完全重启 DeepSeek Harness，右侧栏「开始」页就会出现 **GitSeeable** 入口。

`<包路径>` 可以是**插件目录**（开发时，`link:` 到工作区），也可以是**打包好的
tarball**（分发时，`file:` 到固定版本，装进 profile 的 `node_modules` 里复制一份）：

```sh
cd dsh-plugin && npm pack --pack-destination ..   # → dsh-gitseeable-<version>.tgz
".../dsh.cmd" plugin --profile desktop add --registry=https://registry.npmjs.org/ "D:/path/to/dsh-gitseeable-<version>.tgz"
```

> 两者切换时要先 `remove` 再 `add`：pnpm 会记住原来的 specifier，直接重装有可能
> 报 `Already up to date` 而把旧的 `link:` 留着。

> ⚠ `desktop` 是桌面应用的保留 profile：**PATH 上的全局 `dsh` 管不了它**，会报
> `profile "desktop" is managed exclusively by the Electron application`。
> 必须是应用自带的 CLI（`dsh.cmd` 或上面那条展开命令），两者内部都是
> `dsh-desktop-host/lib/cli.js` + `manageDesktopProfile: true`。

### 如果 pnpm 报 ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION

症状是**任何** `dsh plugin add` 都整体失败：

```
[ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION]
@dsh-ops/bash-win32-x64@0.2.1 could not be checked against minimumReleaseAge
(version not present in registry manifest)
```

**根因是 registry 镜像不同步，不是包缺失**。这个包在官方 npm 上存在
（`0.2.1`），但淘宝镜像 `registry.npmmirror.com` 只同步到了 `0.0.0-stage`。
桌面 profile 的 `registry` 若指向镜像，`minimumReleaseAge` 就无法确认这个版本，
于是整个 lockfile 校验失败——与你装的是哪个插件无关。

先确认自己的 registry：

```sh
pnpm config get registry     # 看到 npmmirror 就是这个问题
```

加上官方 registry 重装即可（也解释了为什么此前装别的插件能成功：
那时锁文件条目少、或镜像当时还没有缺这个版本）：

```sh
"<安装目录>/resources/runtime/cli/bin/dsh.cmd" plugin --profile desktop \
  add --registry=https://registry.npmjs.org/ <包绝对路径>
```

> 注意 `--registry` 必须放在 `add` 之后；`remove` 不接受该参数，
> 需要时用 `pnpm remove -w <name> --config.registry=https://registry.npmjs.org/`。

想**只对桌面 profile 长期生效**，在 profile 目录放一份项目级 `.npmrc`
（pnpm 优先读工程目录的配置，不动你其它项目的镜像设置）：

```sh
# C:\Users\<你>\.dsh\profiles\desktop\.npmrc
registry=https://registry.npmjs.org/
```

> 程序装在 D 盘、profile 却在 `C:\Users\<你>\.dsh\profiles\desktop`，
> 是因为 `DSH_HOME` 指向后者：插件由 pnpm 当作一个独立工程安装在那里，
> 而安装目录里的 `app.asar` 是只读程序体。`.npmrc` 必须跟着 pnpm 的工程目录走。

若确实无法切 registry，也可以完全绕开包管理器（DSH 用标准 Node 解析从
`node_modules` 找 bundle，符号链接就够）：

```sh
cd "$DSH_HOME/profiles/desktop"
mklink /J node_modules\dsh-gitseeable <插件绝对路径>   # Windows；Linux/macOS 用 ln -s
```

再手工在 `package.json` 两处加上插件：

```jsonc
{
  "dependencies": { "dsh-gitseeable": "link:D:\\path\\to\\dsh-plugin" /* … */ },
  "dsh": { "profile": { "bundles": [ /* … */, "dsh-gitseeable" ] } }
}
```

重启后插件作为 profile 的最后一层生效；卸载就是删掉这两处加上那个符号链接。

## 配置

插件在 profile 的 `cordis.patch.yml` 里以固定 id `gitseeable` 出现，可按 id 覆盖：

```yaml
- id: gitseeable
  config:
    basePath: /gitseeable          # 挂载前缀，默认 /gitseeable
    stateDir: C:\Users\me\.dsh\storages\gitseeable  # 界面偏好的落盘目录
```

`stateDir` 默认是 `$DSH_HOME/storages/gitseeable`——插件装在 profile 的
`node_modules` 里，包管理随时可能整体替换它，所以偏好不写进包目录。

## 快捷键

| 平台 | 按键 |
|---|---|
| macOS / Windows / Linux | `Ctrl/Cmd + Shift + G` |

快捷键只是顺手的入口；它和宿主已有按键冲突时会被跳过（只记一条警告），
不影响「开始」页里的入口胶囊。

## 与独立版的关系

`dsh-plugin/lib/` 只负责路由和界面挂载，git 逻辑完全复用仓库里的
`server/app.ts`：`scripts/build-plugin.js` 用 esbuild 把 `server/app.ts`
打成单文件 `server/app.cjs`（express / cors / simple-git 一并内联），再把
`client/dist` 复制成 `server/public`。

因此同一份前端产物两种宿主都能用：

- 独立运行：页面挂在服务器根，接口前缀是 `/api/...`
- 作为插件：页面挂在 `/gitseeable/`，接口前缀是 `/gitseeable/api/...`

前缀由前端从 `window.location.pathname` 反推（`client/src/constants/index.ts`），
不需要第二份构建。

## 安全

GitSeeable 会读取任意目录并执行 git 命令，所以插件的两条路由都经过
Connection 的浏览器认证（`connection.authorizeIndex`）：只有带着 Harness
本身签发的 cookie 的请求才会被处理，从别处探测会拿到 401。

## 已知限制

- 页面在 iframe 里，站点自带的 `X-Frame-Options` 之类限制不涉及（同源），
  但外链的 Google Fonts 在离线环境会静默失败，仅影响字体。
- 右侧栏宽度较窄时，GitSeeable 自己的三栏布局会比较挤；可以切面板全屏。
- 只暴露一个入口：一个 pane 里最多一个 GitSeeable 页（页面类 tab 去重）。
- 插件里**没有**独立的主题开关：配色完全由 Harness 决定。想单独换配色请用
  独立运行（`npm start`），那里保留原来的浅色 / 深色按钮。
