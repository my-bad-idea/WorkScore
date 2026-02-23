#!/usr/bin/env node
/**
 * 一体化构建：先构建前端并复制到 backend/public，再构建后端。
 * 产出：backend/dist、backend/public、backend/node_modules。
 * 使用 npm install 而非 npm ci，避免 Windows 下 node_modules 被占用时 EBUSY。
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const frontendDir = path.join(root, 'frontend');
const backendDir = path.join(root, 'backend');
const publicDir = path.join(backendDir, 'public');

function run(cmd, cwd = root, env = process.env) {
  console.log(`[run] ${cwd ? `(cd ${path.relative(root, cwd)}) ` : ''}${cmd}`);
  execSync(cmd, { cwd: cwd || root, stdio: 'inherit', env: { ...env, FORCE_COLOR: '1' } });
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name);
    const d = path.join(dest, name);
    if (fs.statSync(s).isDirectory()) {
      copyDir(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

function rmDir(dir) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) rmDir(p);
    else fs.unlinkSync(p);
  }
  fs.rmdirSync(dir);
}

// 1. 构建前端
run('npm install', frontendDir);
run('npm run build', frontendDir);

const frontendDist = path.join(frontendDir, 'dist');
if (!fs.existsSync(frontendDist)) {
  console.error('frontend/dist 未生成，请检查前端构建');
  process.exit(1);
}

// 2. 复制 frontend/dist -> backend/public
if (fs.existsSync(publicDir)) rmDir(publicDir);
fs.mkdirSync(publicDir, { recursive: true });
copyDir(frontendDist, publicDir);
console.log('已复制 frontend/dist -> backend/public');

// 3. 构建后端
run('npm install', backendDir);
run('npm run build', backendDir);

console.log('一体化构建完成。产出：backend/dist、backend/public');
console.log('运行：cd backend && node --experimental-sqlite dist/main.js（端口可从 config.json 或 PORT 环境变量读取）');
