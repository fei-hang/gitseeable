# dsh-gitseeable

GitSeeable 的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
插件：在右侧栏的「开始」页新增一个入口，点开即可在本栏里浏览 Git 仓库。

## 它做了什么

- **主机侧**（`lib/index.js`）：把 GitSeeable 的 Express 应用挂到 `/gitseeable/`，
  再注册一个固定地址 `/_gitseeable/mount.json`，让浏览器端能发现挂载前缀。
- **浏览器侧**（`lib/client.js`）：向右侧栏注册一个 tab 类型，并在
  `sidebar.right.pane.tab` 的 guide（「开始」页）里贡献一个入口胶囊。

打开后是一个 iframe，指向 `/<前缀>/?dir=<当前会话的工作区>`，因此会直接定位到
当前工作区的仓库；随后在 GitSeeable 里可以照常切换目录、扫描和浏览。

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

> ⚠ `desktop` 是桌面应用的保留 profile：**PATH 上的全局 `dsh` 管不了它**，会报
> `profile "desktop" is managed exclusively by the Electron application`。
> 必须是应用自带的 CLI（`dsh.cmd` 或上面那条展开命令），两者内部都是
> `dsh-desktop-host/lib/cli.js` + `manageDesktopProfile: true`。

### 如果 pnpm 安装被供应链策略挡住

桌面 profile 在 `$DSH_HOME/profiles/desktop/pnpm-workspace.yaml` 里启用了
`minimumReleaseAge` 校验。若锁文件里有过期/下架的依赖（例如
`@dsh-ops/bash-win32-x64@0.2.1` 在 registry 上并不存在），任何 `pnpm add` 都会整体失败：

```
[ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION] ... could not be checked against minimumReleaseAge
```

这是 profile 自身的问题，与插件无关。**不经过包管理器**安装本地插件即可绕开
（DSH 是用标准 Node 解析从 `node_modules` 找 bundle 的，符号链接就够）：

```sh
cd "$DSH_HOME/profiles/desktop"
mklink /J node_modules\dsh-gitseeable <插件绝对路径>   # Windows；Linux/macOS 用 ln -s
```

然后手工在 `package.json` 的两处加上插件：

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
