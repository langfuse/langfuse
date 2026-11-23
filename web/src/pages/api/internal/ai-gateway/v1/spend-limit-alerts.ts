import { prisma } from "@langfuse/shared/src/db";

import { withGatewaySpendLimitAlertSignatureVerification } from "@/src/features/ai-gateway/server/auth/gatewayRequestSignatureVerifier";
import { GatewaySpendLimitAlertService } from "@/src/features/ai-gateway/server/spendLimits/gatewaySpendLimitAlertService";

const alerts = new GatewaySpendLimitAlertService(prisma);

export default withGatewaySpendLimitAlertSignatureVerification(
  async ({ res, fastHashedSecretKey, limits }) => {
    await alerts.reportReached({
      fastHashedSecretKey,
      limits: limits.map(
        ({ limitId, countingStartedAt, windowStart, thresholdPercent }) => ({
          limitId,
          countingStartedAt: new Date(countingStartedAt),
          windowStart: new Date(windowStart),
          thresholdPercent,
        }),
      ),
    });
    return res.status(200).json({});
  },
);

export const config = {
  api: {
    bodyParser: false,
  },
};
