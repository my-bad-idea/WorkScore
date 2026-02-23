#!/usr/bin/env node
/**
 * 将 backend/dist、backend/public、bin、README.md 复制到 release/，并生成 release/package.json，供 npm 发布。
 * README 中的 docs/ 相对链接会根据 repository URL 转换为 GitHub 绝对链接，确保 npmjs.com 上可正常跳转。
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const backendDir = path.join(root, 'backend');
const releaseDir = path.join(root, 'release');

function copyDir(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn(`[copy-npm-artifacts] 跳过不存在的目录: ${src}`);
    return;
  }
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

// 清空并创建 release/
if (fs.existsSync(releaseDir)) rmDir(releaseDir);
fs.mkdirSync(releaseDir, { recursive: true });

// 复制 backend/dist -> release/dist
const backendDist = path.join(backendDir, 'dist');
if (!fs.existsSync(backendDist)) {
  console.error('[copy-npm-artifacts] backend/dist 不存在，请先执行 npm run build:packaged');
  console.error('[copy-npm-artifacts] 当前项目根目录：', root);
  process.exit(1);
}
copyDir(backendDist, path.join(releaseDir, 'dist'));
console.log('已复制 backend/dist -> release/dist');

// 复制 backend/public -> release/public
const backendPublic = path.join(backendDir, 'public');
if (!fs.existsSync(backendPublic)) {
  console.error('[copy-npm-artifacts] backend/public 不存在，请先执行 npm run build:packaged');
  console.error('[copy-npm-artifacts] 当前项目根目录：', root);
  process.exit(1);
}
copyDir(backendPublic, path.join(releaseDir, 'public'));
console.log('已复制 backend/public -> release/public');

// 复制 bin -> release/bin
const rootBin = path.join(root, 'bin');
if (fs.existsSync(rootBin)) {
  copyDir(rootBin, path.join(releaseDir, 'bin'));
  console.log('已复制 bin -> release/bin');
}

// 读取根 package.json
const rootPkgPath = path.join(root, 'package.json');
const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf-8'));

// 复制并转换 README.md：将 docs/ 相对链接替换为 GitHub 绝对 URL
const readmeSrc = path.join(root, 'README.md');
if (fs.existsSync(readmeSrc)) {
  let readme = fs.readFileSync(readmeSrc, 'utf-8');
  const repoUrl = (rootPkg.repository && rootPkg.repository.url || '').replace(/\.git$/, '');
  if (repoUrl) {
    const blobBase = repoUrl.replace(/^git\+/, '') + '/blob/main/';
    readme = readme.replace(
      /\]\((docs\/[^)]+)\)/g,
      (_, relPath) => `](${blobBase}${relPath})`,
    );
  }
  fs.writeFileSync(path.join(releaseDir, 'README.md'), readme, 'utf-8');
  console.log('已复制并转换 README.md -> release/README.md');
}

// 生成 release/package.json（用于从 release 目录发布）
const releasePkg = {
  name: rootPkg.name,
  version: rootPkg.version,
  description: rootPkg.description,
  license: rootPkg.license,
  author: rootPkg.author,
  repository: rootPkg.repository,
  homepage: rootPkg.homepage,
  main: rootPkg.main,
  bin: rootPkg.bin,
  files: rootPkg.files,
  engines: rootPkg.engines,
  dependencies: rootPkg.dependencies,
};
fs.writeFileSync(
  path.join(releaseDir, 'package.json'),
  JSON.stringify(releasePkg, null, 2) + '\n',
  'utf-8'
);
console.log('已生成 release/package.json');

console.log('npm 发布用产物已就绪：release/（进入 release 后执行 npm install --omit=dev && npm publish）');