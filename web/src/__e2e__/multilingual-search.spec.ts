/**
 * Tests for GitHub issue #11538 — "Full-text search fails for non-English text".
 *
 * Walks the actual UI: signs in as the seed user, navigates to the Traces table with the search
 * box pre-populated (via the `search` / `searchType` query params the table syncs to), and
 * asserts that a trace whose `input`/`output` contains the searched-for non-ASCII text shows up.
 *
 * The fixture traces are written straight to ClickHouse in `beforeAll`, in the same escaped form
 * the Langfuse Python SDK (OpenTelemetry path, `ensure_ascii=True`) persists — so today the
 * full-text query (`input ILIKE '%你好…%'`) does not match the stored `你…` bytes, the
 * table stays empty, and these tests FAIL. After the fix to `clickhouseSearchCondition` they
 * must PASS.
 *
 * Requirements to run locally:
 *   pnpm install
 *   pnpm --filter web exec playwright install chromium
 *   docker compose -f docker-compose.dev.yml up -d --wait   # + migrate/seed Postgres & ClickHouse
 *   pnpm run dev                                             # web on :3000 (Playwright reuses it)
 *   pnpm --filter web run test:e2e -- src/__e2e__/multilingual-search.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { config as loadEnv } from "dotenv";
// Belt-and-suspenders: the `test:e2e` npm script already loads ../.env via `dotenv -e ../.env`,
// but load it again here so the spec also works if invoked directly (cwd is `web/`).
loadEnv({ path: "../.env" });
import { createTrace, createTracesCh } from "@langfuse/shared/src/server";

// seed project / user (see packages/shared/scripts/seeder/seed-postgres.ts)
const PROJECT_ID = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

// `\u`-escape everything >= U+0080 (astral -> surrogate pair) — i.e. JSON `ensure_ascii=True`.
function escapeNonAscii(s: string): string {
  let out = "";
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x80) out += ch;
    else if (cp <= 0xffff) out += "\\u" + cp.toString(16).padStart(4, "0");
    else {
      const v = cp - 0x10000;
      out +=
        "\\u" +
        (0xd800 + (v >> 10)).toString(16).padStart(4, "0") +
        "\\u" +
        (0xdc00 + (v & 0x3ff)).toString(16).padStart(4, "0");
    }
  }
  return out;
}
const pythonJsonDumps = (obj: unknown) => escapeNonAscii(JSON.stringify(obj));

const ZH_TRACE_ID = "e2e-11538-zh";
const AR_TRACE_ID = "e2e-11538-ar";
const ZH_NAME = "e2e-11538-zh-trace";
const AR_NAME = "e2e-11538-ar-trace";
// distinctive phrases so the search can only match via input/output, never the name
const ZH_PHRASE = "你好世界这是一个全文检索测试";
const AR_PHRASE = "مرحبا بالعالم هذا اختبار للبحث النصي الكامل";

test.beforeAll(async () => {
  await createTracesCh([
    createTrace({
      id: ZH_TRACE_ID,
      project_id: PROJECT_ID,
      name: ZH_NAME,
      timestamp: Date.now(),
      input: pythonJsonDumps({ message: ZH_PHRASE }),
    }),
    createTrace({
      id: AR_TRACE_ID,
      project_id: PROJECT_ID,
      name: AR_NAME,
      timestamp: Date.now(),
      output: pythonJsonDumps({ reply: AR_PHRASE }),
    }),
  ]);
});

async function signIn(page: Page) {
  // generous timeouts: `next dev` compiles the sign-in route on first hit, which can take
  // far longer than the default 10s action timeout.
  await page.goto("/auth/sign-in", { timeout: 120_000 });
  const submitBtn = page.locator(
    'button[data-testid="submit-email-password-sign-in-form"]',
  );
  const passwordInput = page.locator('input[type="password"]');
  await page
    .locator('input[name="email"]')
    .waitFor({ state: "visible", timeout: 120_000 });
  await page.fill('input[name="email"]', "demo@langfuse.com", {
    timeout: 60_000,
  });
  // Sign-in is a two-step flow when any SSO provider is configured (email -> "Continue" ->
  // password). When no SSO is configured the password field is shown immediately. Handle both.
  if (!(await passwordInput.isVisible().catch(() => false))) {
    await submitBtn.click({ timeout: 60_000 }); // "Continue"
  }
  await passwordInput.waitFor({ state: "visible", timeout: 60_000 });
  await passwordInput.fill("password", { timeout: 60_000 });
  await expect(submitBtn).toBeEnabled({ timeout: 60_000 });
  await submitBtn.click({ timeout: 60_000 }); // "Sign in"
  await page.waitForTimeout(2000);
  const err = page.locator(".text-destructive");
  if (await err.isVisible().catch(() => false)) {
    throw new Error(`Sign-in failed: ${await err.textContent()}`);
  }
  await expect(page).toHaveURL("/", { timeout: 60_000 });
}

function tracesSearchUrl(query: string) {
  // the Traces table reads `search` and `searchType` from the URL (useFullTextSearch hook).
  // searchType=["id","content"] === the "Full Text → Input/Output" mode.
  return (
    `/project/${PROJECT_ID}/traces?search=${encodeURIComponent(query)}` +
    `&searchType=id&searchType=content`
  );
}

test.describe("Full-text search — non-English (issue #11538)", () => {
  test("finds a trace by Chinese (Simplified) text in its input", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(tracesSearchUrl(ZH_PHRASE));
    // the seeded trace must appear in the table
    await expect(page.getByText(ZH_NAME, { exact: false })).toBeVisible({
      timeout: 60000,
    });
  });

  test("finds a trace by Arabic text in its output", async ({ page }) => {
    await signIn(page);
    await page.goto(tracesSearchUrl(AR_PHRASE));
    await expect(page.getByText(AR_NAME, { exact: false })).toBeVisible({
      timeout: 60000,
    });
  });
});
