import { prisma } from "@langfuse/shared/src/db";

import { withGatewaySpendLimitAlertSignatureVerification } from "@/src/features/ai-gateway/server/auth/gatewayRequestSignatureVerifier";
import { GatewaySpendLimitAlertService } from "@/src/features/ai-gateway/server/spendLimits/gatewaySpendLimitAlertService";

const alerts = new GatewaySpendLimitAlertService(prisma);

export default withGatewaySpendLimitAlertSignatureVerification(
  async ({
    res,
    fastHashedSecretKey,
    limitId,
    countingStartedAt,
    windowStart,
  }) => {
    await alerts.reportReached({
      fastHashedSecretKey,
      limitId,
      countingStartedAt: new Date(countingStartedAt),
      windowStart: new Date(windowStart),
    });
    return res.status(200).json({});
  },
);

export const config = {
  api: {
    bodyParser: false,
  },
};
