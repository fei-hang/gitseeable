#!/usr/bin/env node
// 独立运行入口（npm i -g gitseeable / npm start）。
// 应用本身由 app.ts 构建，便于作为 DSH 插件嵌入复用（插件不会监听端口）。
import app from './app';

const PORT = Number(process.env.PORT) || 3001;

app.listen(PORT, () => {
  console.log(`服务器启动成功: http://localhost:${PORT}`);
});
