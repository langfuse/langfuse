// This script sends test spend alert emails for visual testing.
// Execute with: pnpm tsx src/scripts/send-test-spend-alert-emails.ts
// WARNING: This sends real emails! Comment out before pushing to production.

/*
 * Run the script with:
 *
 * pnpm dotenv -e ../.env -- tsx src/scripts/send-test-spend-alert-emails.ts
 *
 */

import { sendCloudSpendAlertEmail, logger } from "@langfuse/shared/src/server";
import { env } from "../env";

const TEST_EMAILS: string[] = [
  // TODO ADD EMAILS HERE – these accounts will receive test emails
  // email@langfuse.com
];
const TEST_ORG_ID = "test-org-id";
const TEST_ORG_NAME = "Test Organization";

const main = async () => {
  // Check if TEST_EMAILS is empty
  if (TEST_EMAILS.length === 0) {
    console.error("\n❌ Error: TEST_EMAILS list is empty!");
    console.error(
      "\nPlease add email addresses to the TEST_EMAILS array in this script before running it.",
    );
    console.error(
      "Edit the file at: worker/src/scripts/send-test-spend-alert-emails.ts\n",
    );
    process.exit(1);
  }

  console.log(
    `Sending test spend alert emails to ${TEST_EMAILS.length} recipients`,
  );

  // Test scenario 1: Production Alert - $100 threshold exceeded
  console.log("\n📧 Sending Production Alert emails...");
  await sendCloudSpendAlertEmail({
    env: {
      EMAIL_FROM_ADDRESS: env.EMAIL_FROM_ADDRESS,
      SMTP_CONNECTION_URL: env.SMTP_CONNECTION_URL,
      NEXTAUTH_URL: env.NEXTAUTH_URL,
    },
    orgId: TEST_ORG_ID,
    orgName: TEST_ORG_NAME,
    alertTitle: "Production Alert",
    currentSpend: 127.45,
    threshold: 100.0,
    detectedAtUtc: new Date().toISOString(),
    recipients: TEST_EMAILS,
  });
  console.log("  ✓ Production Alert emails sent");

  // Test scenario 2: Development Alert - $50 threshold exceeded
  console.log("\n📧 Sending Development Alert emails...");
  await sendCloudSpendAlertEmail({
    env: {
      EMAIL_FROM_ADDRESS: env.EMAIL_FROM_ADDRESS,
      SMTP_CONNECTION_URL: env.SMTP_CONNECTION_URL,
      NEXTAUTH_URL: env.NEXTAUTH_URL,
    },
    orgId: TEST_ORG_ID,
    orgName: TEST_ORG_NAME,
    alertTitle: "Development Environment Alert",
    currentSpend: 67.89,
    threshold: 50.0,
    detectedAtUtc: new Date().toISOString(),
    recipients: TEST_EMAILS,
  });
  console.log("  ✓ Development Alert emails sent");

  // Test scenario 3: High-value alert - $1000 threshold exceeded
  console.log("\n📧 Sending High-Value Alert emails...");
  await sendCloudSpendAlertEmail({
    env: {
      EMAIL_FROM_ADDRESS: env.EMAIL_FROM_ADDRESS,
      SMTP_CONNECTION_URL: env.SMTP_CONNECTION_URL,
      NEXTAUTH_URL: env.NEXTAUTH_URL,
    },
    orgId: TEST_ORG_ID,
    orgName: TEST_ORG_NAME,
    alertTitle: "Enterprise Budget Alert",
    currentSpend: 1234.56,
    threshold: 1000.0,
    detectedAtUtc: new Date().toISOString(),
    recipients: TEST_EMAILS,
  });
  console.log("  ✓ High-Value Alert emails sent");

  console.log(
    `\n✅ All test spend alert emails sent successfully to ${TEST_EMAILS.length} recipients`,
  );
  console.log("Recipients:", TEST_EMAILS.join(", "));
  console.log("\nTest scenarios sent:");
  console.log("  1. Production Alert: $127.45 / $100.00 threshold");
  console.log("  2. Development Alert: $67.89 / $50.00 threshold");
  console.log("  3. Enterprise Budget Alert: $1,234.56 / $1,000.00 threshold");
};

if (require.main === module) {
  main()
    .catch((err) => {
      logger.error("Error sending test spend alert emails:", err);
      process.exit(1);
    })
    .finally(() => {
      process.exit(0);
    });
}
