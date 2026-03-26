import { test } from "@playwright/test";
import path from "path";

const SCREENSHOT_DIR = path.resolve("screenshots");

// iPhone 14 Pro viewport
const IPHONE = {
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
};

// Mock repos
const MOCK_REPOS = [
  { id: "AgentNest", name: "AgentNest", path: "/Project/AgentNest" },
  { id: "VideoViewer", name: "VideoViewer", path: "/Project/VideoViewer" },
  { id: "Vidspire", name: "Vidspire", path: "/Project/Vidspire" },
  { id: "blog", name: "blog", path: "/Project/blog" },
  { id: "Eiken", name: "Eiken", path: "/Project/Eiken" },
  { id: "HLGCut2", name: "HLGCut2", path: "/Project/HLGCut2" },
  { id: "VideoScope", name: "VideoScope", path: "/Project/VideoScope" },
];

// Mock files for AgentNest root
const MOCK_ROOT_FILES = [
  { name: "Docs", path: "Docs", type: "directory" },
  { name: "frontend", path: "frontend", type: "directory" },
  { name: "server", path: "server", type: "directory" },
  { name: "tests", path: "tests", type: "directory" },
  { name: "CLAUDE.md", path: "CLAUDE.md", type: "file", size: 1240, extension: ".md" },
  { name: "package.json", path: "package.json", type: "file", size: 512, extension: ".json" },
  { name: "playwright.config.ts", path: "playwright.config.ts", type: "file", size: 480, extension: ".ts" },
  { name: "tsconfig.json", path: "tsconfig.json", type: "file", size: 320, extension: ".json" },
  { name: "README.md", path: "README.md", type: "file", size: 4096, extension: ".md" },
];

// Mock files for Docs directory
const MOCK_DOCS_FILES = [
  { name: "AgentNest仕様.md", path: "Docs/AgentNest仕様.md", type: "file", size: 9164, extension: ".md" },
  { name: "web画面.md", path: "Docs/web画面.md", type: "file", size: 10423, extension: ".md" },
  { name: "実装計画.md", path: "Docs/実装計画.md", type: "file", size: 5049, extension: ".md" },
];

// Specification file content (excerpt for beautiful screenshot)
const SPEC_CONTENT = `# AgentNest 仕様書

## 概要

AgentNest は、ブラウザから Claude Code を操作する汎用 Web インターフェース。
VSCode を使えないユーザーでも、ブラウザのチャット UI から Claude Code と対話的に作業できる。

### 想定ユースケース

- **ブログ記事投稿**: iPhone から Google Photos URL を貼って記事生成・公開
- **仕様書生成**: コード・DB定義を読み取り、テンプレートに沿った画面仕様書を生成
- **汎用**: 任意のリポジトリに対して Claude Code の全機能を利用

### 利用環境

- **サーバ**: ローカルマシン（macOS）で手動起動
- **アクセス**: Tailscale VPN 経由で外部（iPhone等）からアクセス
- **認証**: Claude Code の Max サブスクリプション（サーバマシンにログイン済み）

---

## システム構成

\`\`\`
クライアント (iPhone Safari / PC ブラウザ)
  → Tailscale VPN
    → Mac (localhost:3000)
      → AgentNest サーバ (Express)
        → Claude Code SDK (@anthropic-ai/claude-code)
          → 対象リポジトリのファイルシステムを直接操作
\`\`\`

### 技術スタック

| レイヤー | 技術 |
|---------|------|
| フロントエンド | React + Vite（スマホ対応レスポンシブ） |
| バックエンド | Express (Node.js / TypeScript) |
| AI エンジン | Claude Code SDK |
| リアルタイム通信 | Server-Sent Events (SSE) |
| 認証 | ローカル運用のため不要（Tailscale） |

---

## 画面構成

### メイン画面（チャット）

\`\`\`
┌─────────────────────────────────────┐
│ AgentNest        [リポジトリ選択 ▼] │
├─────────────────────────────────────┤
│                                     │
│  🤖 どのような作業をしますか？       │
│                                     │
│  👤 釣りの写真で記事書いて           │
│                                     │
│  🤖 画像を取得しています...          │
│     12枚の画像を検出しました。       │
│                                     │
├─────────────────────────────────────┤
│ [メッセージ入力...          ] [送信] │
└─────────────────────────────────────┘
\`\`\``;

async function setupMocks(page: import("@playwright/test").Page) {
  await page.route("/api/repos", (route) =>
    route.fulfill({ json: MOCK_REPOS })
  );
  await page.route("/api/sessions/**", (route) =>
    route.fulfill({ json: [] })
  );
  await page.route("/api/status", (route) =>
    route.fulfill({ json: { status: "idle" } })
  );
  await page.route("/api/reconnect", (route) =>
    route.fulfill({ status: 404 })
  );
  await page.route("**/api/repos/*/files?dir=Docs", (route) =>
    route.fulfill({ json: MOCK_DOCS_FILES })
  );
  await page.route("**/api/repos/*/files", (route) => {
    const url = route.request().url();
    if (url.includes("dir=")) return route.fallback();
    return route.fulfill({ json: MOCK_ROOT_FILES });
  });
  await page.route("**/api/repos/*/file/**", (route) =>
    route.fulfill({
      json: {
        type: "markdown",
        content: SPEC_CONTENT,
      },
    })
  );
}

async function selectRepo(page: import("@playwright/test").Page) {
  // Click the repo selector trigger
  const trigger = page.locator("text=Select repo");
  await trigger.click();
  await page.waitForTimeout(400);

  // Click AgentNest in the dropdown list (avoid the header title)
  const dropdownItem = page.locator('[class*="MuiCollapse"] >> text=AgentNest');
  await dropdownItem.click();
  await page.waitForTimeout(600);
}

test.describe("iPhone Screenshots", () => {
  // ─── 1. Initial welcome screen ───
  test("01-welcome", async ({ browser }) => {
    const ctx = await browser.newContext(IPHONE);
    const page = await ctx.newPage();
    await setupMocks(page);

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Select repo to show "何かお手伝いできますか？"
    await selectRepo(page);

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "01-welcome.png"),
    });
    await ctx.close();
  });

  // ─── 2. Docs folder in file browser ───
  test("02-docs-folder", async ({ browser }) => {
    const ctx = await browser.newContext(IPHONE);
    const page = await ctx.newPage();
    await setupMocks(page);

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await selectRepo(page);

    // Switch to Files tab
    await page.click("text=ファイル");
    await page.waitForTimeout(400);

    // Click Docs folder
    await page.click("text=Docs");
    await page.waitForTimeout(600);

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "02-docs-folder.png"),
    });
    await ctx.close();
  });

  // ─── 3. Spec file viewer ───
  test("03-spec-viewer", async ({ browser }) => {
    const ctx = await browser.newContext(IPHONE);
    const page = await ctx.newPage();
    await setupMocks(page);

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await selectRepo(page);

    // Switch to Files tab
    await page.click("text=ファイル");
    await page.waitForTimeout(400);

    // Click Docs folder
    await page.click("text=Docs");
    await page.waitForTimeout(400);

    // Click spec file
    await page.click("text=AgentNest仕様.md");
    await page.waitForTimeout(800);

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "03-spec-viewer.png"),
    });
    await ctx.close();
  });

  // ─── 4. Chat with messages (bonus for README) ───
  test("04-chat", async ({ browser }) => {
    const ctx = await browser.newContext(IPHONE);
    const page = await ctx.newPage();
    await setupMocks(page);

    // Mock chat API with SSE
    let chatCallCount = 0;
    await page.route("/api/chat", async (route) => {
      chatCallCount++;
      const lines: string[] = [];

      if (chatCallCount === 1) {
        lines.push(
          `data: ${JSON.stringify({ type: "session_id", sessionId: "s1" })}`,
          `data: ${JSON.stringify({
            type: "tool_result",
            toolName: "Bash",
            content: "ls -la Docs/\ntotal 48\n-rw-r--r--  9164 AgentNest仕様.md\n-rw-r--r-- 10423 web画面.md\n-rw-r--r--  5049 実装計画.md",
          })}`,
          `data: ${JSON.stringify({
            type: "text",
            content:
              "プロジェクトの構成を確認しました。\n\n**AgentNest**はブラウザから Claude Code を操作するWebアプリです：\n\n- `frontend/` — React + Vite UI\n- `server/` — Express API + Claude Code SDK\n- `Docs/` — 仕様書・設計ドキュメント\n\n何か変更しますか？",
          })}`,
          `data: ${JSON.stringify({ type: "done", sessionId: "s1" })}`
        );
      }

      await route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
        },
        body: lines.join("\n") + "\n",
      });
    });

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await selectRepo(page);

    // Type and send message
    const textarea = page.getByRole("textbox", { name: "Message AgentNest..." });
    await textarea.tap();
    await textarea.fill("プロジェクトの構成を教えて");
    await page.waitForTimeout(200);

    // Find send button (IconButton with ArrowUpward icon, inside the input row)
    const sendBtn = page.locator("button:visible").filter({ has: page.locator("svg") }).last();
    await sendBtn.tap();
    await page.waitForTimeout(2000);

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "04-chat.png"),
    });
    await ctx.close();
  });
});
