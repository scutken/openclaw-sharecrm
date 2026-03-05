#!/bin/bash
# Windows 本地构建脚本 (Git Bash / MSYS2 / Cygwin)

set -e

echo "📦 开始构建 openclaw-sharecrm..."

# 安装依赖并构建
npm install
npm run build

# 创建发布目录
mkdir -p dist-package

# 复制必要文件
cp -r dist dist-package/
cp package.json dist-package/
cp openclaw.plugin.json dist-package/
cp README.md dist-package/

# 获取版本号
VERSION=$(node -p "require('./package.json').version")
ZIP_NAME="openclaw-sharecrm-v${VERSION}.zip"

# 创建压缩包 (使用 PowerShell 的 Compress-Archive)
cd dist-package
powershell -Command "Compress-Archive -Path * -DestinationPath ../$ZIP_NAME -Force"
cd ..

# 清理
rm -rf dist-package

echo "✅ 构建完成: $ZIP_NAME"
