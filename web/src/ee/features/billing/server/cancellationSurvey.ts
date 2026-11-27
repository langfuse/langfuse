import { type Plan } from "@langfuse/shared";
import { type PrismaClient, SurveyName } from "@langfuse/shared/src/db";

import {
  type CancellationFeedback,
  type CancellationReasonPlacement,
} from "@/src/ee/features/billing/utils/cancellationReasons";

type CancellationSurveyPrisma = {
  survey: Pick<PrismaClient["survey"], "create">;
};

/** Stores why an organization cancelled, one row per confirmed cancel on either billing system. */
export const recordCancellationSurvey = async ({
  prisma,
  orgId,
  user,
  feedback,
  placement,
  plan,
  billingProvider,
  periodEnd,
}: {
  prisma: CancellationSurveyPrisma;
  orgId: string;
  user: { id: string; email?: string | null };
  feedback: CancellationFeedback;
  placement?: CancellationReasonPlacement | undefined;
  plan: Plan | null;
  billingProvider: "stripe" | "clickhouse";
  periodEnd: Date | null;
}) =>
  prisma.survey.create({
    data: {
      surveyName: SurveyName.ORG_CANCELLATION,
      response: {
        reason: feedback.reason,
        ...(feedback.note ? { note: feedback.note } : {}),
        plan,
        billingProvider,
        ...(placement ?? {}),
        periodEnd: periodEnd ? periodEnd.toISOString() : null,
      },
      userId: user.id,
      userEmail: user.email ?? null,
      orgId,
    },
  });
