// This script sends test threshold emails for visual testing.
// Execute with: pnpm tsx src/scripts/send-test-threshold-emails.ts
// WARNING: This sends real emails! Comment out before pushing to production.

/*
 * Run the script with:
 *
 * pnpm dotenv -e ../.env -- tsx src/scripts/send-test-threshold-emails.ts
 *
 */

import {
  sendUsageThresholdWarningEmail,
  sendUsageThresholdSuspensionEmail,
  logger,
} from "@langfuse/shared/src/server";
import { env } from "../env";

const TEST_EMAILS: string[] = [
  // TODO ADD EMAILS HERE – these accounts will receive test emails
  // email@langfuse.com
];
const TEST_ORG_NAME = "Test Organization";
const BILLING_URL =
  "http://localhost:3000/organization/test-org-id/settings/billing";

// Calculate a reset date 30 days from now
const resetDate = new Date();
resetDate.setDate(resetDate.getDate() + 30);
const RESET_DATE = resetDate.toISOString();

const main = async () => {
  // Check if TEST_EMAILS is empty
  if (TEST_EMAILS.length === 0) {
    console.error("\n❌ Error: TEST_EMAILS list is empty!");
    console.error(
      "\nPlease add email addresses to the TEST_EMAILS array in this script before running it.",
    );
    console.error(
      "Edit the file at: worker/src/scripts/send-test-threshold-emails.ts\n",
    );
    process.exit(1);
  }

  console.log(
    `Sending test threshold emails to ${TEST_EMAILS.length} recipients`,
  );

  for (const email of TEST_EMAILS) {
    console.log(`\n📧 Sending to ${email}...`);

    // Send warning email (50k threshold)
    console.log("  → Warning email (50k threshold)...");
    await sendUsageThresholdWarningEmail({
      env: {
        EMAIL_FROM_ADDRESS: env.EMAIL_FROM_ADDRESS,
        SMTP_CONNECTION_URL: env.SMTP_CONNECTION_URL,
        NEXTAUTH_URL: env.NEXTAUTH_URL,
        CLOUD_CRM_EMAIL: env.CLOUD_CRM_EMAIL,
      },
      organizationName: TEST_ORG_NAME,
      currentUsage: 52_347,
      limit: 50_000,
      billingUrl: BILLING_URL,
      receiverEmail: email,
      resetDate: RESET_DATE,
    });
    console.log("  ✓ Warning email sent");

    // Send blocking/suspension email (200k threshold)
    console.log("  → Blocking email (200k threshold)...");
    await sendUsageThresholdSuspensionEmail({
      env: {
        EMAIL_FROM_ADDRESS: env.EMAIL_FROM_ADDRESS,
        SMTP_CONNECTION_URL: env.SMTP_CONNECTION_URL,
        NEXTAUTH_URL: env.NEXTAUTH_URL,
        CLOUD_CRM_EMAIL: env.CLOUD_CRM_EMAIL,
      },
      organizationName: TEST_ORG_NAME,
      currentUsage: 253_891,
      limit: 50_000,
      billingUrl: BILLING_URL,
      receiverEmail: email,
      resetDate: RESET_DATE,
    });
    console.log("  ✓ Blocking email sent");
  }

  console.log(
    `\n✅ All test emails sent successfully to ${TEST_EMAILS.length} recipients`,
  );
  console.log("Recipients:", TEST_EMAILS.join(", "));
};

if (require.main === module) {
  main()
    .catch((err) => {
      logger.error("Error sending test emails:", err);
      process.exit(1);
    })
    .finally(() => {
      process.exit(0);
    });
}
