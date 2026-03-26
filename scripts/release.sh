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

# Tauri署名キーの確認
if [ -z "$TAURI_SIGNING_PRIVATE_KEY" ]; then
  echo "警告: TAURI_SIGNING_PRIVATE_KEY が未設定です"
  echo "  署名なしでビルドします（自動更新は無効）"
fi

# 1. バージョンアップ
echo "=== バージョンアップ ==="
npm version patch --no-git-tag-version
VERSION=$(node -p "require('./package.json').version")
echo "リリースバージョン: v${VERSION}"

# 2. バージョン変更をコミット & タグ
git add package.json package-lock.json
git commit -m "リリース: v${VERSION}"
git tag "v${VERSION}"

# 3. フロントエンドビルド
echo "=== フロントエンドビルド ==="
npm run build

# 4. Tauriビルド
echo "=== Tauriビルド ==="
npx tauri build

# 5. GitHub Releasesへ公開
echo "=== GitHub Releasesへ公開 ==="
BUNDLE_DIR="src-tauri/target/release/bundle"

# リリース作成
gh release create "v${VERSION}" \
  --title "v${VERSION}" \
  --draft \
  --generate-notes

# バンドル成果物をアップロード
if [ -d "$BUNDLE_DIR/dmg" ]; then
  for f in "$BUNDLE_DIR/dmg"/*.dmg; do
    [ -f "$f" ] && gh release upload "v${VERSION}" "$f"
  done
fi
if [ -d "$BUNDLE_DIR/macos" ]; then
  # .appをzip化してアップロード
  for app in "$BUNDLE_DIR/macos"/*.app; do
    if [ -d "$app" ]; then
      APP_NAME=$(basename "$app" .app)
      (cd "$BUNDLE_DIR/macos" && zip -r "${APP_NAME}.app.zip" "$(basename "$app")")
      gh release upload "v${VERSION}" "$BUNDLE_DIR/macos/${APP_NAME}.app.zip"
    fi
  done
fi

# Tauri updater用 latest.json があればアップロード
if [ -f "$BUNDLE_DIR/macos/latest.json" ]; then
  gh release upload "v${VERSION}" "$BUNDLE_DIR/macos/latest.json"
fi

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
