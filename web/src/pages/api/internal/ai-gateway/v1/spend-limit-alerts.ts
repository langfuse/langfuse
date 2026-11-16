import { prisma } from "@langfuse/shared/src/db";

import { withGatewaySpendLimitAlertSignatureVerification } from "@/src/features/ai-gateway/server/auth/gatewayRequestSignatureVerifier";
import { GatewaySpendLimitAlertService } from "@/src/features/ai-gateway/server/spendLimits/gatewaySpendLimitAlertService";

const alerts = new GatewaySpendLimitAlertService(prisma);

export default withGatewaySpendLimitAlertSignatureVerification(
  async ({ res, fastHashedSecretKey, limitId, generation }) => {
    await alerts.reportReached({ fastHashedSecretKey, limitId, generation });
    return res.status(200).json({});
  },
);

export const config = {
  api: {
    bodyParser: false,
  },
};
