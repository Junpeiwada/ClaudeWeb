import { test, expect, Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_REPOS = [
  { id: "TestRepo", name: "TestRepo", path: "/tmp/TestRepo" },
];

const SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";

function sseBody(events: object[]): string {
  return events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
}

async function mockRepos(page: Page) {
  await page.route("/api/repos", (route) =>
    route.fulfill({ json: TEST_REPOS })
  );
}

async function selectRepo(page: Page) {
  await page.getByText("Select repo").click();
  await page.getByText("TestRepo").nth(0).click();
}

async function sendMessage(page: Page, message: string) {
  const input = page.getByPlaceholder("Message AgentNest...");
  await input.fill(message);
  await input.press("Meta+Enter");
}

/** 長いテキストを生成してスクロール可能な状態を作る */
function makeLongContent(lines: number): string {
  return Array.from({ length: lines }, (_, i) => `Line ${i + 1}: Lorem ipsum dolor sit amet.`).join("\n\n");
}

/** スクロールコンテナの情報を取得 */
async function getScrollInfo(page: Page) {
  return page.evaluate(() => {
    // MessageListのスクロールコンテナを探す（overflow: autoの要素）
    const containers = document.querySelectorAll<HTMLElement>('[style*="overflow"]');
    // MUIはstyle属性ではなくclass経由なので、別の方法で探す
    const all = document.querySelectorAll("div");
    for (const el of all) {
      const style = getComputedStyle(el);
      if (
        style.overflow === "auto" &&
        el.scrollHeight > el.clientHeight &&
        el.clientHeight > 0
      ) {
        return {
          scrollTop: el.scrollTop,
          scrollHeight: el.scrollHeight,
          clientHeight: el.clientHeight,
          distanceFromBottom: el.scrollHeight - el.scrollTop - el.clientHeight,
        };
      }
    }
    return null;
  });
}

/** スクロールコンテナを上にスクロール */
async function scrollUp(page: Page, pixels: number) {
  await page.evaluate((px) => {
    const all = document.querySelectorAll("div");
    for (const el of all) {
      const style = getComputedStyle(el);
      if (
        style.overflow === "auto" &&
        el.scrollHeight > el.clientHeight &&
        el.clientHeight > 0
      ) {
        el.scrollTop = Math.max(0, el.scrollTop - px);
        el.dispatchEvent(new Event("scroll"));
        break;
      }
    }
  }, pixels);
}

/** スクロールコンテナを最下部にスクロール */
async function scrollToBottom(page: Page) {
  await page.evaluate(() => {
    const all = document.querySelectorAll("div");
    for (const el of all) {
      const style = getComputedStyle(el);
      if (
        style.overflow === "auto" &&
        el.scrollHeight > el.clientHeight &&
        el.clientHeight > 0
      ) {
        el.scrollTop = el.scrollHeight;
        el.dispatchEvent(new Event("scroll"));
        break;
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Auto-scroll behavior", () => {
  test("auto-scrolls to bottom when user is at bottom", async ({ page }) => {
    await mockRepos(page);

    const longText = makeLongContent(50);

    await page.route("/api/chat", (route) => {
      return route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
        body: sseBody([
          { type: "session_id", sessionId: SESSION_ID },
          { type: "text", content: longText },
          { type: "done", sessionId: SESSION_ID },
        ]),
      });
    });

    await page.goto("/");
    await selectRepo(page);
    await sendMessage(page, "Long response");

    // レスポンスの最後の行が表示されるまで待つ
    await expect(page.getByText("Line 50:")).toBeVisible({ timeout: 5000 });

    // 最下部付近にスクロールされているはず
    const info = await getScrollInfo(page);
    expect(info).not.toBeNull();
    expect(info!.distanceFromBottom).toBeLessThanOrEqual(80);
  });

  test("stops auto-scroll when user scrolls up, resumes when scrolled back to bottom", async ({
    page,
  }) => {
    await mockRepos(page);

    const longText = makeLongContent(50);

    // 1回目のチャット: 長いレスポンスでスクロール可能な状態を作る
    let chatCallCount = 0;
    await page.route("/api/chat", (route) => {
      chatCallCount++;
      if (chatCallCount === 1) {
        return route.fulfill({
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
          body: sseBody([
            { type: "session_id", sessionId: SESSION_ID },
            { type: "text", content: longText },
            { type: "done", sessionId: SESSION_ID },
          ]),
        });
      }
      // 2回目: 追加テキスト
      return route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
        body: sseBody([
          { type: "session_id", sessionId: SESSION_ID },
          { type: "text", content: "ADDITIONAL_RESPONSE_TEXT" },
          { type: "done", sessionId: SESSION_ID },
        ]),
      });
    });

    await page.goto("/");
    await selectRepo(page);

    // 1回目のメッセージ送信
    await sendMessage(page, "First message");
    await expect(page.getByText("Line 50:")).toBeVisible({ timeout: 5000 });

    // ユーザーが上にスクロール（自動スクロールが無効になるはず）
    await scrollUp(page, 500);

    // スクロール位置を記録
    const infoAfterScrollUp = await getScrollInfo(page);
    expect(infoAfterScrollUp).not.toBeNull();
    expect(infoAfterScrollUp!.distanceFromBottom).toBeGreaterThan(80);
    const scrollTopAfterScrollUp = infoAfterScrollUp!.scrollTop;

    // 2回目のメッセージ送信
    await sendMessage(page, "Second message");
    await expect(page.getByText("ADDITIONAL_RESPONSE_TEXT")).toBeVisible({
      timeout: 5000,
    });

    // スクロール位置が最下部にジャンプしていないことを確認
    const infoAfterSecondMsg = await getScrollInfo(page);
    expect(infoAfterSecondMsg).not.toBeNull();
    expect(infoAfterSecondMsg!.distanceFromBottom).toBeGreaterThan(80);

    // 最下部にスクロールして自動スクロールを再有効化
    await scrollToBottom(page);

    // 少し待ってスクロールイベントが処理されるのを確認
    await page.waitForTimeout(100);

    const infoAtBottom = await getScrollInfo(page);
    expect(infoAtBottom).not.toBeNull();
    expect(infoAtBottom!.distanceFromBottom).toBeLessThanOrEqual(80);
  });
});
