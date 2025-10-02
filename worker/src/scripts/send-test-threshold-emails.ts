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

const TEST_EMAILS = [
  "michael@langfuse.com",
  "marc@langfuse.com",
  "felix@langfuse.com",
  "jannik@langfuse.com",
  "akio@langfuse.com",
  "clemens@langfuse.com",
];
const TEST_ORG_NAME = "Test Organization";
const BILLING_URL =
  "http://localhost:3000/organization/test-org-id/settings/billing";

const main = async () => {
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
      },
      organizationName: TEST_ORG_NAME,
      currentUsage: 52_347,
      limit: 50_000,
      billingUrl: BILLING_URL,
      receiverEmail: email,
    });
    console.log("  ✓ Warning email sent");

    // Send blocking/suspension email (200k threshold)
    console.log("  → Blocking email (200k threshold)...");
    await sendUsageThresholdSuspensionEmail({
      env: {
        EMAIL_FROM_ADDRESS: env.EMAIL_FROM_ADDRESS,
        SMTP_CONNECTION_URL: env.SMTP_CONNECTION_URL,
        NEXTAUTH_URL: env.NEXTAUTH_URL,
      },
      organizationName: TEST_ORG_NAME,
      currentUsage: 203_891,
      limit: 50_000,
      billingUrl: BILLING_URL,
      receiverEmail: email,
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
