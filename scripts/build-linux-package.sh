#!/bin/sh
# 构建 Linux 发行用目录或 tarball（需先执行 npm run build:packaged）
# 产出: dist/installers/workscore-0.1.0-linux 目录及 .tar.gz，可据此打 .deb/.rpm 或做 AppImage
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND="$ROOT/backend"
SCRIPTS="$ROOT/scripts"
VERSION=$(node -p "require('$ROOT/package.json').version")
OUT_DIR="$ROOT/dist/installers/workscore-$VERSION-linux"
ARCHIVE="$ROOT/dist/installers/workscore-$VERSION-linux.tar.gz"

echo "准备 Linux 发行目录..."
rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

cp -R "$BACKEND/dist" "$OUT_DIR/"
cp -R "$BACKEND/public" "$OUT_DIR/"
cp -R "$BACKEND/node_modules" "$OUT_DIR/"
cp "$SCRIPTS/start.sh" "$OUT_DIR/"
cp "$SCRIPTS/config.json" "$OUT_DIR/"
chmod +x "$OUT_DIR/start.sh"

echo "完成: $OUT_DIR"
if command -v tar >/dev/null 2>&1; then
  (cd "$ROOT/dist/installers" && tar czf "workscore-$VERSION-linux.tar.gz" "workscore-$VERSION-linux")
  echo "已打包: $ARCHIVE"
fi
echo "如需 .deb/.rpm，可将上述目录放入包中，并使用 scripts/linux/postinst 在安装时配置端口。"
