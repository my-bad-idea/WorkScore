#!/usr/bin/env node
/**
 * WorkScore CLI 入口：以 --experimental-sqlite 启动后端服务。
 * npm install -g work-score 后执行 work-score 即可启动。
 */
const path = require('path');
const { spawn } = require('child_process');

const pkgRoot = path.join(__dirname, '..');
const mainPath = path.join(pkgRoot, 'dist', 'main.js');

const child = spawn(
  process.execPath,
  ['--experimental-sqlite', mainPath],
  { stdio: 'inherit', cwd: process.cwd(), env: process.env },
);

['SIGINT', 'SIGTERM'].forEach((sig) => {
  process.on(sig, () => child.kill(sig));
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 1);
  }
});
