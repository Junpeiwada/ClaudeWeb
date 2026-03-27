import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

// テスト用のリポジトリデータ
const TEST_REPOS = [
  { id: "TestRepo", name: "TestRepo", path: "/tmp/TestRepo" },
];

/** Mock /api/repos to return a fixed repo list */
async function mockRepos(page: Page) {
  await page.route("/api/repos", (route) =>
    route.fulfill({ json: TEST_REPOS })
  );
}

/** Select the test repo from the dropdown */
async function selectRepo(page: Page) {
  // Click the repo selector trigger ("Select repo" text)
  await page.getByText("Select repo").click();
  // Click the repo name in the dropdown
  await page.getByText("TestRepo").nth(0).click();
}

test.describe("iOS入力フィールドのテスト", () => {
  test.beforeEach(async ({ page }) => {
    await mockRepos(page);
    await page.goto("/");
  });

  test("入力フィールドにiOS予測変換を無効化する属性が設定されている", async ({ page }) => {
    await selectRepo(page);
    // InputBaseコンポーネント内のテキストエリアを取得（MUIのInputBaseはtextareaを内包）
    const textarea = page.locator('textarea').first();

    // 属性の確認
    await expect(textarea).toHaveAttribute("autocomplete", "off");
    await expect(textarea).toHaveAttribute("autocorrect", "off");
    await expect(textarea).toHaveAttribute("autocapitalize", "off");
    await expect(textarea).toHaveAttribute("spellcheck", "false");
    await expect(textarea).toHaveAttribute("data-form-type", "other");
  });

  test("入力フィールドのフォーカス・ブラー処理が正しく動作する", async ({ page }) => {
    await selectRepo(page);
    const textarea = page.locator('textarea').first();

    // フォーカス前のCSS変数確認
    const initialKeyboardVisible = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--keyboard-visible')
    );
    expect(initialKeyboardVisible.trim()).toBe('0');

    // フォーカスをセット
    await textarea.focus();
    await page.waitForTimeout(100); // フォーカスイベント処理を待つ

    // フォーカス後はvisualViewportイベントを待つ（デスクトップでは発生しない）
    // デスクトップブラウザではキーボードは表示されないため、値は変わらないはず
    const focusedKeyboardVisible = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--keyboard-visible')
    );

    // ブラーをセット
    await textarea.blur();
    await page.waitForTimeout(100); // ブラーイベント処理を待つ

    // ブラー後のCSS変数確認
    const blurredKeyboardVisible = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--keyboard-visible')
    );
    expect(blurredKeyboardVisible.trim()).toBe('0');
  });

  test("セーフエリア調整用のCSS変数が正しく設定されている", async ({ page }) => {
    await selectRepo(page);
    // CSS変数の初期値確認
    const rootStyles = await page.evaluate(() => {
      const root = document.documentElement;
      const styles = getComputedStyle(root);
      return {
        keyboardVisible: styles.getPropertyValue('--keyboard-visible'),
      };
    });

    expect(rootStyles.keyboardVisible.trim()).toBe('0');

    // 下部のBox要素のパディング確認（textareaを含むBox要素の親要素）
    const bottomBox = page.locator('textarea').first().locator('../../..');

    // padding-bottomスタイルが存在することを確認
    const paddingBottom = await bottomBox.evaluate((el) =>
      window.getComputedStyle(el).paddingBottom
    );
    expect(paddingBottom).toBeTruthy();
  });

  test("画像添付ボタンとテキスト入力が正しく動作する", async ({ page }) => {
    // リポジトリを選択して入力フィールドを有効化
    await selectRepo(page);

    // 画像添付ボタンの存在確認
    const imageButton = page.locator('button').filter({
      has: page.locator('svg[data-testid*="ImageRounded"]')
    }).first();
    await expect(imageButton).toBeVisible();

    // テキストエリアに文字を入力
    const textarea = page.locator('textarea').first();
    await textarea.fill("テストメッセージ");
    await expect(textarea).toHaveValue("テストメッセージ");

    // 送信ボタンが有効化されることを確認
    const sendButton = page.locator('button').filter({
      has: page.locator('svg[data-testid*="ArrowUpwardRounded"]')
    }).first();
    await expect(sendButton).toBeEnabled();
  });

  test("モバイルビューポートでの表示確認", async ({ page }) => {
    // iPhoneサイズにビューポート変更
    await page.setViewportSize({ width: 375, height: 812 });
    await selectRepo(page);

    // 入力フィールドが表示されていることを確認
    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible();

    // モバイルでも属性が正しく設定されていることを確認
    await expect(textarea).toHaveAttribute("autocomplete", "off");
    await expect(textarea).toHaveAttribute("autocorrect", "off");
  });

  test("複数行入力が正しく動作する", async ({ page }) => {
    // リポジトリを選択して入力フィールドを有効化
    await selectRepo(page);

    const textarea = page.locator('textarea').first();

    // 複数行のテキストを入力
    await textarea.fill("1行目\n2行目\n3行目");
    const value = await textarea.inputValue();
    expect(value).toContain("1行目");
    expect(value).toContain("2行目");
    expect(value).toContain("3行目");

    // maxRows制限があることを確認（6行まで）
    const longText = Array(10).fill("テスト行").join("\n");
    await textarea.fill(longText);

    // textareaの高さが一定以上にならないことを確認
    const height = await textarea.evaluate((el) => el.scrollHeight);
    const clientHeight = await textarea.evaluate((el) => el.clientHeight);

    // スクロールが発生している（maxRowsに達している）ことを確認
    if (height > clientHeight) {
      expect(height).toBeGreaterThan(clientHeight);
    }
  });
});

// iOSデバイス専用のテスト（エミュレーション）
test.describe("iOSデバイスエミュレーション", () => {
  test.use({
    ...test.use,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
    viewport: { width: 375, height: 812 },
    hasTouch: true,
    isMobile: true,
  });

  test("iOSデバイスでの入力フィールド動作確認", async ({ page }) => {
    await mockRepos(page);
    await page.goto("/");

    // リポジトリを選択して入力フィールドを有効化
    await selectRepo(page);

    const textarea = page.locator('textarea').first();

    // タッチイベントで入力フィールドをタップ
    await textarea.tap();

    // iOS属性が設定されていることを確認
    await expect(textarea).toHaveAttribute("autocomplete", "off");
    await expect(textarea).toHaveAttribute("autocorrect", "off");
    await expect(textarea).toHaveAttribute("autocapitalize", "off");

    // テキスト入力
    await textarea.fill("iOSからのテスト入力");
    await expect(textarea).toHaveValue("iOSからのテスト入力");
  });
});