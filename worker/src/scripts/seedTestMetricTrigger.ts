/**
 * Seeds a test metric trigger + webhook action + automation for local testing.
 *
 * USAGE:
 *   1. Replace WEBHOOK_SITE_URL below with your webhook.site URL
 *   2. Run from the worker/ directory:
 *        dotenv -e ../.env -- tsx src/scripts/seedTestMetricTrigger.ts
 *
 * This creates:
 *   - An action: WEBHOOK pointing to your webhook.site URL
 *   - A trigger: trace_metric with condition "total_cost_usd >= 0" (always fires)
 *   - An automation: linking them together for the demo project
 *
 * The cooldown is 1 minute so you can re-run the evaluator multiple times.
 */
import { prisma } from "@langfuse/shared/src/db";
import { encrypt, generateWebhookSecret } from "@langfuse/shared/encryption";

// ─── CONFIGURE THESE ────────────────────────────────────────────────────────
const WEBHOOK_SITE_URL =
  "https://webhook.site/c36a8af2-e396-44e7-95e3-120c85110c65";
const PROJECT_ID = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a"; // demo project
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Seeding test metric trigger...\n");

  // Cleanup any leftover test rows from a previous run
  await prisma.automation.deleteMany({
    where: { projectId: PROJECT_ID, name: "TEST: metric-alert webhook" },
  });

  // 1. Create action
  const { secretKey, displaySecretKey } = generateWebhookSecret();
  const action = await prisma.action.create({
    data: {
      projectId: PROJECT_ID,
      type: "WEBHOOK",
      config: {
        type: "WEBHOOK",
        url: WEBHOOK_SITE_URL,
        requestHeaders: {},
        headers: {},
        displayHeaders: {},
        apiVersion: { prompt: "v1" },
        secretKey: encrypt(secretKey),
        displaySecretKey,
      },
    },
  });
  console.log(`✓ Action created:  ${action.id}`);

  // 2. Create trigger  (condition: total_cost_usd >= 0, always fires)
  const trigger = await prisma.trigger.create({
    data: {
      projectId: PROJECT_ID,
      eventSource: "trace_metric",
      eventActions: [],
      filter: {
        metric: "total_cost_usd",
        operator: ">=",
        threshold: 0,
        lookbackWindowMinutes: 60,
        cooldownMinutes: 1, // short cooldown for rapid re-testing
      },
      status: "ACTIVE",
    },
  });
  console.log(`✓ Trigger created: ${trigger.id}`);

  // 3. Link them via an automation
  const automation = await prisma.automation.create({
    data: {
      name: "TEST: metric-alert webhook",
      projectId: PROJECT_ID,
      triggerId: trigger.id,
      actionId: action.id,
    },
  });
  console.log(`✓ Automation created: ${automation.id}`);

  console.log("\n─────────────────────────────────────────────────────");
  console.log("All done!  Now run the evaluator:");
  console.log("  dotenv -e ../.env -- tsx src/scripts/runMetricEvaluator.ts");
  console.log("─────────────────────────────────────────────────────\n");

  await prisma.$disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("✗ Error:", err);
  process.exit(1);
});
