#!/bin/bash
# 构建并打包脚本

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

# 创建压缩包
cd dist-package
zip -r ../openclaw-sharecrm-v$(node -p "require('./package.json').version").zip .
cd ..

# 清理
rm -rf dist-package

echo "✅ 构建完成: openclaw-sharecrm-v$(node -p "require('./package.json').version").zip"
