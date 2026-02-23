#!/bin/sh
# 构建 macOS .pkg 安装包（需先执行 npm run build:packaged）
# 依赖: 系统自带 pkgbuild、productbuild
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND="$ROOT/backend"
SCRIPTS="$ROOT/scripts"
PACK_ROOT="$ROOT/dist/pack-macos"
APP_NAME="WorkScore"
INSTALL_PATH="Applications/$APP_NAME"
PKG_VERSION=$(node -p "require('$ROOT/package.json').version")

echo "准备 macOS 安装包目录..."
rm -rf "$PACK_ROOT"
mkdir -p "$PACK_ROOT/$INSTALL_PATH"

cp -R "$BACKEND/dist" "$PACK_ROOT/$INSTALL_PATH/"
cp -R "$BACKEND/public" "$PACK_ROOT/$INSTALL_PATH/"
cp -R "$BACKEND/node_modules" "$PACK_ROOT/$INSTALL_PATH/"
cp "$SCRIPTS/start.sh" "$PACK_ROOT/$INSTALL_PATH/"
cp "$SCRIPTS/config.json" "$PACK_ROOT/$INSTALL_PATH/"
chmod +x "$PACK_ROOT/$INSTALL_PATH/start.sh"

# 安装脚本
mkdir -p "$PACK_ROOT/scripts"
cp "$SCRIPTS/macos/postinstall" "$PACK_ROOT/scripts/"
chmod +x "$PACK_ROOT/scripts/postinstall"

echo "正在生成 .pkg..."
pkgbuild --root "$PACK_ROOT" \
  --identifier "com.workscore.app" \
  --version "$PKG_VERSION" \
  --scripts "$PACK_ROOT/scripts" \
  --install-location "/" \
  "$ROOT/dist/installers/WorkScore-$PKG_VERSION.pkg"

echo "完成: dist/installers/WorkScore-$PKG_VERSION.pkg"
rm -rf "$PACK_ROOT"
