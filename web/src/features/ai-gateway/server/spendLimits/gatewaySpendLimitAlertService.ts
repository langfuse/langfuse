import { createHash, randomUUID } from "crypto";

import { Role } from "@langfuse/shared";
import type {
  GatewaySpendLimitInterval,
  PrismaClient,
} from "@langfuse/shared/src/db";
import {
  NotificationQueue,
  QueueJobs,
  type NotificationEventType,
} from "@langfuse/shared/src/server";

import { env } from "@/src/env.mjs";
import { GatewayControlPlaneError } from "@/src/features/ai-gateway/server/gatewayControlPlaneError";
import { getGatewaySpendLimitWindowStart } from "@/src/features/ai-gateway/server/spendLimits/getGatewaySpendLimitWindowStart";

type GatewaySpendLimitEmail = Extract<
  NotificationEventType,
  { type: "AI_GATEWAY_SPEND_LIMIT_REACHED" }
>;

/**
 * Emails the key's owner and the organization's owners when the gateway
 * reports that a key reached a spend limit. The gateway may report a limit
 * any number of times; the stored alert lets only the first report of a
 * limit's generation and window send emails.
 */
export class GatewaySpendLimitAlertService {
  constructor(private readonly prisma: PrismaClient) {}

  async reportReached(params: {
    fastHashedSecretKey: string;
    limitId: string;
    generation: number;
    now?: Date;
  }): Promise<void> {
    const limit = await this.prisma.gatewaySpendLimit.findFirst({
      where: {
        id: params.limitId,
        generation: params.generation,
        apiKey: { fastHashedSecretKey: params.fastHashedSecretKey },
      },
      select: {
        id: true,
        interval: true,
        limitUsd: true,
        generation: true,
        organization: { select: { id: true, name: true } },
        apiKey: {
          select: { note: true, user: { select: { email: true, name: true } } },
        },
      },
    });
    // A reset or deleted limit was reported late; its counters no longer apply.
    if (!limit?.apiKey) return;
    if (!env.SMTP_CONNECTION_URL || !env.EMAIL_FROM_ADDRESS) return;

    const queue = NotificationQueue.getInstance();
    if (!queue) {
      throw new GatewayControlPlaneError(
        "Notification queue is unavailable",
        503,
      );
    }

    const windowStart = getGatewaySpendLimitWindowStart(
      limit.interval,
      params.now,
    );
    const alert = {
      spendLimitId: limit.id,
      generation: limit.generation,
      windowStart,
    };
    const { count } = await this.prisma.gatewaySpendLimitAlert.createMany({
      data: [alert],
      skipDuplicates: true,
    });
    if (count === 0) return;

    const owners = await this.prisma.organizationMembership.findMany({
      where: { orgId: limit.organization.id, role: Role.OWNER },
      select: { user: { select: { email: true, name: true } } },
    });
    const recipients = new Map<
      string,
      { name: string | null; audience: GatewaySpendLimitEmail["audience"] }
    >();
    const keyOwner = limit.apiKey.user;
    if (keyOwner?.email) {
      recipients.set(keyOwner.email.toLowerCase(), {
        name: keyOwner.name,
        audience: "keyOwner",
      });
    }
    for (const { user } of owners) {
      const to = user.email?.toLowerCase();
      if (to && !recipients.has(to)) {
        recipients.set(to, { name: user.name, audience: "orgOwner" });
      }
    }

    const resetsAt = getNextWindowStart(limit.interval, windowStart);
    const jobs = [...recipients].map(([to, { name, audience }]) => {
      const payload: GatewaySpendLimitEmail = {
        type: "AI_GATEWAY_SPEND_LIMIT_REACHED",
        orgId: limit.organization.id,
        orgName: limit.organization.name,
        to,
        receiverName: name ?? undefined,
        audience,
        keyName: limit.apiKey?.note ?? "Unnamed key",
        interval: limit.interval,
        limitUsd: limit.limitUsd.toNumber(),
        resetsAt: resetsAt?.toISOString(),
      };
      return {
        name: QueueJobs.NotificationJob,
        data: {
          timestamp: new Date(),
          id: randomUUID(),
          payload,
          name: QueueJobs.NotificationJob as const,
        },
        opts: {
          jobId: `ai-gateway-spend-limit-${limit.id}-${limit.generation}-${windowStart.getTime()}-${createHash("sha256").update(to).digest("hex")}`,
        },
      };
    });

    try {
      await queue.addBulk(jobs);
    } catch (error) {
      // Without the alert, the gateway's next report sends the emails again.
      await this.prisma.gatewaySpendLimitAlert.deleteMany({ where: alert });
      throw error;
    }
  }
}

function getNextWindowStart(
  interval: GatewaySpendLimitInterval,
  windowStart: Date,
): Date | null {
  const day = 24 * 60 * 60 * 1000;
  switch (interval) {
    case "DAILY":
      return new Date(windowStart.getTime() + day);
    case "WEEKLY":
      return new Date(windowStart.getTime() + 7 * day);
    case "MONTHLY":
      return new Date(
        Date.UTC(windowStart.getUTCFullYear(), windowStart.getUTCMonth() + 1),
      );
    case "TOTAL":
      return null;
  }
}
