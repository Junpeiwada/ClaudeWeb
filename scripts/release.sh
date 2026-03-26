#!/bin/bash
set -e

# ghコマンドの存在チェック
if ! command -v gh &> /dev/null; then
  echo "エラー: GitHub CLI (gh) がインストールされていません"
  echo "  brew install gh && gh auth login"
  exit 1
fi

# gh auth tokenからGH_TOKENを取得
export GH_TOKEN=$(gh auth token 2>/dev/null)
if [ -z "$GH_TOKEN" ]; then
  echo "エラー: GitHub CLIが未認証です"
  echo "  gh auth login を実行してください"
  exit 1
fi
echo "GitHub認証: OK"

# 1. バージョンアップ
echo "=== バージョンアップ ==="
npm version patch --no-git-tag-version
VERSION=$(node -p "require('./package.json').version")
echo "リリースバージョン: v${VERSION}"

# 2. バージョン変更をコミット & タグ
git add package.json package-lock.json
git commit -m "リリース: v${VERSION}"
git tag "v${VERSION}"

# 3. ビルド
echo "=== ビルド ==="
npm run build
npm run electron:build

# 4. GH_TOKENをアプリに埋め込み（electron-updater用）
echo "{\"token\":\"${GH_TOKEN}\"}" > dist-electron/gh-token.json

# 5. GitHub Releasesへ公開
echo "=== GitHub Releasesへ公開 ==="
npx electron-builder --mac --publish always

# 6. git push
echo "=== git push ==="
git push origin main
git push origin "v${VERSION}"

# 7. draftリリースを公開
echo "=== リリースを公開 ==="
gh release edit "v${VERSION}" --draft=false

# 8. 古いリリースを削除（最新以外）
echo "=== 古いリリースを削除 ==="
TAGS=$(gh release list --json tagName -q '.[].tagName' 2>/dev/null || true)
if [ -n "$TAGS" ]; then
  echo "$TAGS" | tail -n +2 | while read -r tag; do
    if [ -n "$tag" ]; then
      echo "  削除: ${tag}"
      gh release delete "${tag}" --yes --cleanup-tag 2>/dev/null || true
    fi
  done
fi

echo ""
echo "=== リリース完了: v${VERSION} ==="
say -v Kyoko "AgentNestリリースバージョン${VERSION}が完了しました" &
