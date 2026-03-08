/**
 * One-shot script to immediately run the metric trigger evaluator.
 * Use this for local testing instead of waiting for the 5-min cron.
 *
 * Run from the worker/ directory:
 *   dotenv -e ../.env -- tsx src/scripts/runMetricEvaluator.ts
 */
import { evaluateAllMetricTriggers } from "../features/metricTriggers/metricTriggerEvaluator";

async function main() {
  console.log("▶ Running metric trigger evaluator...");
  await evaluateAllMetricTriggers();
  console.log("✓ Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error("✗ Error:", err);
  process.exit(1);
});
