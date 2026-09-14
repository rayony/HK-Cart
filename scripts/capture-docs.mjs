import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const ROOT = "/workspace";
const DOCS = path.join(ROOT, "docs");
const APP = "http://127.0.0.1:8080/";
const FLOW = `file://${DOCS}/fuzzy-search-flow.html`;
const LIST = ["金象米", "可口可樂 330毫升 x8", "綠茶 600ml", "玉泉梳打水"].join("\n");

async function jpeg(target, file, options = {}) {
  await target.screenshot({
    path: path.join(DOCS, file),
    type: "jpeg",
    quality: 88,
    ...options,
  });
  console.log("wrote", file);
}

async function waitCatalog(page) {
  await page.waitForFunction(
    () => {
      const compare = [...document.querySelectorAll("button")].find((b) =>
        /^\s*格價\s*$/.test(b.textContent ?? ""),
      );
      return compare && !compare.disabled;
    },
    { timeout: 90_000 },
  );
}

async function main() {
  await mkdir(DOCS, { recursive: true });
  const browser = await chromium.launch({
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=medium"],
  });

  const flowPage = await browser.newPage({
    viewport: { width: 1080, height: 900 },
    deviceScaleFactor: 2,
  });
  await flowPage.goto(FLOW, { waitUntil: "networkidle" });
  await flowPage.evaluate(() => document.fonts.ready);
  await flowPage.waitForTimeout(400);
  await jpeg(flowPage.locator(".page"), "fuzzy-search-flow.jpg");

  const page = await browser.newPage({
    viewport: { width: 1280, height: 860 },
    deviceScaleFactor: 2,
  });
  await page.goto(APP, { waitUntil: "networkidle" });
  await waitCatalog(page);
  await page.evaluate(() => document.fonts.ready);
  await page.locator("textarea").fill(LIST);
  await jpeg(page, "usage-1-list.jpg");

  await page.getByRole("button", { name: "格價", exact: true }).click();
  await page.getByText("一間買晒").waitFor({ timeout: 60_000 });
  await page.getByText("確認一下呢幾件").waitFor({ timeout: 30_000 });
  await page
    .locator("li")
    .filter({ hasText: "原本：玉泉梳打水" })
    .getByText(/HKTVmall|惠康|其他來源|網上舖/)
    .first()
    .waitFor({ timeout: 25_000 })
    .catch(() => {});
  await page.waitForTimeout(1200);

  await page.getByText("一間買晒").scrollIntoViewIfNeeded();
  await jpeg(page, "usage-2-results.jpg");

  const yushuen = page.locator("li").filter({ hasText: "原本：玉泉梳打水" });
  await yushuen.scrollIntoViewIfNeeded();
  await jpeg(yushuen, "usage-3-not-found.jpg");

  const coke = page.locator("article").filter({ hasText: "可口可樂" }).first();
  await coke.scrollIntoViewIfNeeded();
  await jpeg(coke, "usage-4-matched.jpg");
  await coke.getByRole("button", { name: "改搜尋" }).click();

  const cokeRefine = page.locator("li").filter({ hasText: "原本：可口可樂" });
  await cokeRefine.waitFor();
  await cokeRefine.scrollIntoViewIfNeeded();
  await jpeg(cokeRefine, "usage-5-wrong-product.jpg");

  await page.getByRole("textbox", { name: "可口可樂 330毫升 x8 搜尋關鍵字" }).fill("可口可樂 2公升");
  await cokeRefine.getByRole("button", { name: "再搵", exact: true }).click();
  await cokeRefine.getByText("消委會貨表").waitFor({ timeout: 20_000 });
  await page.waitForTimeout(600);
  await cokeRefine.scrollIntoViewIfNeeded();
  await jpeg(cokeRefine, "usage-6-research.jpg");

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
