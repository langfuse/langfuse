import { createHash, randomUUID } from "crypto";

import { Role } from "@langfuse/shared";
import {
  GatewaySpendLimitAlertType,
  type PrismaClient,
} from "@langfuse/shared/src/db";
import {
  NotificationQueue,
  QueueJobs,
  type NotificationEventType,
} from "@langfuse/shared/src/server";

import { env } from "@/src/env.mjs";
import { GatewayControlPlaneError } from "@/src/features/ai-gateway/server/gatewayControlPlaneError";
import {
  getGatewaySpendLimitWindowEnd,
  getGatewaySpendLimitWindowStart,
} from "@/src/features/ai-gateway/fns/gatewaySpendLimitWindow";

type GatewaySpendLimitEmail = Extract<
  NotificationEventType,
  { type: "AI_GATEWAY_SPEND_LIMIT_REACHED" }
>;

/**
 * Emails the key's owner and the organization's owners when the gateway
 * reports that a key reached spend limits. The gateway may report a limit any
 * number of times; the stored alert lets only the first report of a limit's
 * counting start and window send emails. Limits one report claims share one
 * email per recipient. The gateway names each window, so a report that arrives
 * after the window closed still counts toward the window it was reached in.
 */
type ReportedLimit = Awaited<
  ReturnType<typeof findReportedLimits>
>[number]["limit"];
type AlertKey = {
  spendLimitId: string;
  type: GatewaySpendLimitAlertType;
  countingStartedAt: Date;
  windowStart: Date;
};
type ClaimedAlert = { limit: ReportedLimit; alert: AlertKey };
type Recipient = {
  to: string;
  name: string | null;
  audience: GatewaySpendLimitEmail["audience"];
};

export class GatewaySpendLimitAlertService {
  constructor(private readonly prisma: PrismaClient) {}

  async reportReached(params: {
    fastHashedSecretKey: string;
    limits: { limitId: string; countingStartedAt: Date; windowStart: Date }[];
  }): Promise<void> {
    // A deleted limit, or a report from an earlier counting start, no longer applies.
    const reported = await findReportedLimits(this.prisma, params);
    if (reported.length === 0) return;
    for (const { limit, windowStart } of reported) {
      if (
        getGatewaySpendLimitWindowStart(
          limit.interval,
          windowStart,
        ).getTime() !== windowStart.getTime()
      ) {
        throw new GatewayControlPlaneError(
          "windowStart is not the start of a window",
          400,
        );
      }
    }
    if (!env.SMTP_CONNECTION_URL || !env.EMAIL_FROM_ADDRESS) return;

    const queue = NotificationQueue.getInstance();
    if (!queue) {
      throw new GatewayControlPlaneError(
        "Notification queue is unavailable",
        503,
      );
    }

    const claimed: ClaimedAlert[] = [];
    try {
      for (const { limit, windowStart } of reported) {
        const alert: AlertKey = {
          spendLimitId: limit.id,
          type: GatewaySpendLimitAlertType.EXCEEDED,
          countingStartedAt: limit.countingStartedAt,
          windowStart,
        };
        if (await this.claimAlert(alert)) claimed.push({ limit, alert });
      }
      if (claimed.length === 0) return;
      const recipients = await this.getRecipients(claimed[0]!.limit);
      await queue.addBulk(
        recipients.map((recipient) => toNotificationJob(claimed, recipient)),
      );
    } catch (error) {
      // Without the alerts, the gateway's next report sends the emails again.
      await this.prisma.gatewaySpendLimitAlert.deleteMany({
        where: { OR: claimed.map(({ alert }) => alert) },
      });
      throw error;
    }
  }

  /** Whether this report is the first for the alert, so it should send emails. */
  private async claimAlert(alert: AlertKey): Promise<boolean> {
    const { count } = await this.prisma.gatewaySpendLimitAlert.createMany({
      data: [alert],
      skipDuplicates: true,
    });
    return count > 0;
  }

  /** The key's owner and the organization's owners, one entry per email address. */
  private async getRecipients(limit: ReportedLimit): Promise<Recipient[]> {
    const orgOwners = await this.prisma.organizationMembership.findMany({
      where: { orgId: limit.organization.id, role: Role.OWNER },
      select: { user: { select: { email: true, name: true } } },
    });
    const candidates = [
      { user: limit.apiKey.user, audience: "keyOwner" as const },
      ...orgOwners.map(({ user }) => ({ user, audience: "orgOwner" as const })),
    ];

    const recipients = new Map<string, Recipient>();
    for (const { user, audience } of candidates) {
      const to = user?.email?.toLowerCase();
      if (to && !recipients.has(to)) {
        recipients.set(to, { to, name: user?.name ?? null, audience });
      }
    }
    return [...recipients.values()];
  }
}

/** The reported limits that still belong to the calling key at the reported counting start. */
async function findReportedLimits(
  prisma: PrismaClient,
  params: {
    fastHashedSecretKey: string;
    limits: { limitId: string; countingStartedAt: Date; windowStart: Date }[];
  },
) {
  const limits = await prisma.gatewaySpendLimit.findMany({
    where: {
      id: { in: params.limits.map(({ limitId }) => limitId) },
      apiKey: { fastHashedSecretKey: params.fastHashedSecretKey },
    },
    select: {
      id: true,
      interval: true,
      limitUsd: true,
      countingStartedAt: true,
      organization: { select: { id: true, name: true } },
      apiKey: {
        select: {
          id: true,
          note: true,
          displaySecretKey: true,
          user: { select: { email: true, name: true } },
        },
      },
    },
  });
  return params.limits.flatMap(
    ({ limitId, countingStartedAt, windowStart }) => {
      const limit = limits.find(
        ({ id, countingStartedAt: started }) =>
          id === limitId && started.getTime() === countingStartedAt.getTime(),
      );
      return limit?.apiKey
        ? [{ limit: { ...limit, apiKey: limit.apiKey }, windowStart }]
        : [];
    },
  );
}

function toNotificationJob(claimed: ClaimedAlert[], recipient: Recipient) {
  const { limit } = claimed[0]!;
  const payload: GatewaySpendLimitEmail = {
    type: "AI_GATEWAY_SPEND_LIMIT_REACHED",
    orgId: limit.organization.id,
    orgName: limit.organization.name,
    to: recipient.to,
    receiverName: recipient.name ?? undefined,
    audience: recipient.audience,
    scope: {
      type: "API_KEY",
      apiKeyId: limit.apiKey.id,
      name: limit.apiKey.note ?? "Unnamed key",
      displaySecretKey: limit.apiKey.displaySecretKey,
    },
    limits: claimed.map(({ limit, alert }) => ({
      interval: limit.interval,
      limitUsd: limit.limitUsd.toNumber(),
      resetsAt: getGatewaySpendLimitWindowEnd(
        limit.interval,
        alert.windowStart,
      )?.toISOString(),
    })),
  };
  const alertsHash = createHash("sha256")
    .update(
      claimed
        .map(
          ({ alert }) =>
            `${alert.spendLimitId}-${alert.type}-${alert.countingStartedAt.getTime()}-${alert.windowStart.getTime()}`,
        )
        .toSorted()
        .join(","),
    )
    .digest("hex");
  const recipientHash = createHash("sha256").update(recipient.to).digest("hex");
  return {
    name: QueueJobs.NotificationJob,
    data: {
      timestamp: new Date(),
      id: randomUUID(),
      payload,
      name: QueueJobs.NotificationJob as const,
    },
    opts: {
      jobId: `ai-gateway-spend-limit-${alertsHash}-${recipientHash}`,
    },
  };
}
