#!/bin/bash
# アイコン一括生成スクリプト
# 使い方: ./scripts/generate-icons.sh
# ソース: build/icon_1024.png (1024x1024 PNG)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SOURCE="$ROOT/build/icon_1024.png"

if [ ! -f "$SOURCE" ]; then
  echo "エラー: $SOURCE が見つかりません"
  exit 1
fi

echo "ソース: $SOURCE"

resize() {
  sips -z "$1" "$1" "$SOURCE" --out "$2" > /dev/null 2>&1
  echo "  $(basename "$2") (${1}x${1})"
}

# ─── macOS iconset & icns ───
echo ""
echo "=== macOS iconset ==="
ICONSET="$ROOT/build/icon.iconset"
mkdir -p "$ICONSET"
resize 16   "$ICONSET/icon_16x16.png"
resize 32   "$ICONSET/icon_16x16@2x.png"
resize 32   "$ICONSET/icon_32x32.png"
resize 64   "$ICONSET/icon_32x32@2x.png"
resize 128  "$ICONSET/icon_128x128.png"
resize 256  "$ICONSET/icon_128x128@2x.png"
resize 256  "$ICONSET/icon_256x256.png"
resize 512  "$ICONSET/icon_256x256@2x.png"
resize 512  "$ICONSET/icon_512x512.png"
resize 1024 "$ICONSET/icon_512x512@2x.png"

echo ""
echo "=== macOS icns ==="
iconutil -c icns "$ICONSET" -o "$ROOT/build/icon.icns"
echo "  icon.icns"

# ─── Tauri icons ───
ICONS="$ROOT/src-tauri/icons"
mkdir -p "$ICONS"

echo ""
echo "=== Tauri 標準 ==="
resize 32  "$ICONS/32x32.png"
resize 64  "$ICONS/64x64.png"
resize 128 "$ICONS/128x128.png"
resize 256 "$ICONS/128x128@2x.png"
cp "$ROOT/build/icon.icns" "$ICONS/icon.icns"
echo "  icon.icns (コピー)"

echo ""
echo "=== Windows ICO ==="
# ICOをPNG埋め込みで生成
python3 -c "
import struct, subprocess, tempfile, os

def create_ico(png_files, output):
    entries = []
    for path, size in png_files:
        with open(path, 'rb') as f:
            data = f.read()
        entries.append((size, data))
    with open(output, 'wb') as f:
        f.write(struct.pack('<HHH', 0, 1, len(entries)))
        offset = 6 + len(entries) * 16
        for size, data in entries:
            w = size if size < 256 else 0
            f.write(struct.pack('<BBBBHHII', w, w, 0, 0, 1, 32, len(data), offset))
            offset += len(data)
        for _, data in entries:
            f.write(data)

sizes = [16, 24, 32, 48, 64, 128, 256]
png_files = []
for s in sizes:
    tmp = os.path.join(tempfile.gettempdir(), f'icon_{s}.png')
    subprocess.run(['sips', '-z', str(s), str(s), '$SOURCE', '--out', tmp], capture_output=True)
    png_files.append((tmp, s))
create_ico(png_files, '$ICONS/icon.ico')
for p, _ in png_files:
    os.remove(p)
"
echo "  icon.ico"

echo ""
echo "=== Windows Store ==="
resize 30  "$ICONS/Square30x30Logo.png"
resize 44  "$ICONS/Square44x44Logo.png"
resize 71  "$ICONS/Square71x71Logo.png"
resize 89  "$ICONS/Square89x89Logo.png"
resize 107 "$ICONS/Square107x107Logo.png"
resize 142 "$ICONS/Square142x142Logo.png"
resize 150 "$ICONS/Square150x150Logo.png"
resize 284 "$ICONS/Square284x284Logo.png"
resize 310 "$ICONS/Square310x310Logo.png"
resize 50  "$ICONS/StoreLogo.png"

# ─── iOS ───
echo ""
echo "=== iOS ==="
IOS="$ICONS/ios"
mkdir -p "$IOS"
resize 20  "$IOS/AppIcon-20x20@1x.png"
resize 40  "$IOS/AppIcon-20x20@2x.png"
resize 60  "$IOS/AppIcon-20x20@3x.png"
resize 29  "$IOS/AppIcon-29x29@1x.png"
resize 58  "$IOS/AppIcon-29x29@2x.png"
resize 87  "$IOS/AppIcon-29x29@3x.png"
resize 40  "$IOS/AppIcon-40x40@1x.png"
resize 80  "$IOS/AppIcon-40x40@2x.png"
resize 120 "$IOS/AppIcon-40x40@3x.png"
resize 120 "$IOS/AppIcon-60x60@2x.png"
resize 180 "$IOS/AppIcon-60x60@3x.png"
resize 76  "$IOS/AppIcon-76x76@1x.png"
resize 152 "$IOS/AppIcon-76x76@2x.png"
resize 167 "$IOS/AppIcon-83.5x83.5@2x.png"
resize 512 "$IOS/AppIcon-512@2x.png"

# ─── Android ───
echo ""
echo "=== Android ==="
ANDROID="$ICONS/android"
for density in mipmap-mdpi mipmap-hdpi mipmap-xhdpi mipmap-xxhdpi mipmap-xxxhdpi; do
  mkdir -p "$ANDROID/$density"
done

# ic_launcher: mdpi=48, hdpi=72, xhdpi=96, xxhdpi=144, xxxhdpi=192
resize 48  "$ANDROID/mipmap-mdpi/ic_launcher.png"
resize 72  "$ANDROID/mipmap-hdpi/ic_launcher.png"
resize 96  "$ANDROID/mipmap-xhdpi/ic_launcher.png"
resize 144 "$ANDROID/mipmap-xxhdpi/ic_launcher.png"
resize 192 "$ANDROID/mipmap-xxxhdpi/ic_launcher.png"

# ic_launcher_round
resize 48  "$ANDROID/mipmap-mdpi/ic_launcher_round.png"
resize 72  "$ANDROID/mipmap-hdpi/ic_launcher_round.png"
resize 96  "$ANDROID/mipmap-xhdpi/ic_launcher_round.png"
resize 144 "$ANDROID/mipmap-xxhdpi/ic_launcher_round.png"
resize 192 "$ANDROID/mipmap-xxxhdpi/ic_launcher_round.png"

# ic_launcher_foreground: mdpi=108, hdpi=162, xhdpi=216, xxhdpi=324, xxxhdpi=432
resize 108 "$ANDROID/mipmap-mdpi/ic_launcher_foreground.png"
resize 162 "$ANDROID/mipmap-hdpi/ic_launcher_foreground.png"
resize 216 "$ANDROID/mipmap-xhdpi/ic_launcher_foreground.png"
resize 324 "$ANDROID/mipmap-xxhdpi/ic_launcher_foreground.png"
resize 432 "$ANDROID/mipmap-xxxhdpi/ic_launcher_foreground.png"

# ─── Web favicon ───
echo ""
echo "=== Web favicon ==="
PUBLIC="$ROOT/frontend/public"
resize 16  "$PUBLIC/favicon-16x16.png"
resize 32  "$PUBLIC/favicon-32x32.png"
resize 96  "$PUBLIC/icon-96.png"
resize 180 "$PUBLIC/apple-touch-icon.png"
resize 192 "$PUBLIC/icon-192.png"
resize 512 "$PUBLIC/icon-512.png"

echo ""
echo "完了！全アイコンを生成しました。"
