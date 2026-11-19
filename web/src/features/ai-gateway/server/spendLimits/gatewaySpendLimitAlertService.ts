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
import {
  GATEWAY_DEFAULT_SPEND_LIMIT_ID_SEPARATOR,
  GATEWAY_DEFAULT_SPEND_LIMIT_SCOPES,
} from "./gatewayDefaultSpendLimits";
import { GATEWAY_ORGANIZATION_SPEND_LIMIT_SCOPE } from "./gatewayOrganizationSpendLimitScope";

const REPORTED_USER_SELECT = { id: true, email: true, name: true } as const;

type GatewaySpendLimitEmail = Extract<
  NotificationEventType,
  { type: "AI_GATEWAY_SPEND_LIMIT_REACHED" }
>;

/**
 * Emails whom a limit applies to (the key's owner, or the user of a user
 * limit) and the organization's owners when the gateway reports that a key
 * reached spend limits. The gateway may report a limit any
 * number of times; the stored alert lets only the first report of a limit's
 * counting start and window send emails. Limits one report claims share one
 * email per recipient. The gateway names each window, so a report that arrives
 * after the window closed still counts toward the window it was reached in.
 */
type ReportedLimit = Awaited<
  ReturnType<typeof findReportedLimits>
>[number]["limit"];
type GatewayDefaultSpendLimitScope =
  (typeof GATEWAY_DEFAULT_SPEND_LIMIT_SCOPES)[keyof typeof GATEWAY_DEFAULT_SPEND_LIMIT_SCOPES];
type AlertKey = {
  spendLimitId: string;
  /** The key or user a default limit was reached for; empty for their own limits. */
  subjectId: string;
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
      for (const { limit, subjectId, windowStart } of reported) {
        const alert: AlertKey = {
          spendLimitId: limit.id,
          subjectId,
          type: GatewaySpendLimitAlertType.EXCEEDED,
          countingStartedAt: limit.countingStartedAt,
          windowStart,
        };
        if (await this.claimAlert(alert)) claimed.push({ limit, alert });
      }
      // A request can reach its key's and its user's limits; each scope gets its own email.
      for (const group of groupByScope(claimed)) {
        const recipients = await this.getRecipients(group[0]!.limit);
        await queue.addBulk(
          recipients.map((recipient) => toNotificationJob(group, recipient)),
        );
      }
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

  /** Whom the limit applies to and the organization's owners, one entry per email address. */
  private async getRecipients(limit: ReportedLimit): Promise<Recipient[]> {
    const orgOwners = await this.prisma.organizationMembership.findMany({
      where: { orgId: limit.organization.id, role: Role.OWNER },
      select: { user: { select: { email: true, name: true } } },
    });
    const candidates = [
      {
        user: limit.apiKey ? limit.apiKey.user : limit.user,
        audience: "keyOwner" as const,
      },
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

/**
 * The reported limits that still apply to the calling key at the reported
 * counting start: the key's own, and its owner's in the key's organization.
 * A default is reported under an id naming the key or user it applied to, and
 * still applies only while that key or user has no limit of its own.
 */
async function findReportedLimits(
  prisma: PrismaClient,
  params: {
    fastHashedSecretKey: string;
    limits: { limitId: string; countingStartedAt: Date; windowStart: Date }[];
  },
) {
  const callingKey = await prisma.apiKey.findUnique({
    where: { fastHashedSecretKey: params.fastHashedSecretKey },
    select: {
      id: true,
      note: true,
      displaySecretKey: true,
      orgId: true,
      userId: true,
      user: {
        select: {
          ...REPORTED_USER_SELECT,
          gatewaySpendLimits: {
            where: { scope: "USER" },
            select: { organizationId: true },
          },
        },
      },
      gatewayAssociation: { select: { apiKeyId: true } },
      _count: { select: { gatewaySpendLimits: true } },
    },
  });
  if (!callingKey?.orgId) return [];
  const { orgId, userId, user } = callingKey;

  const defaultSubjects = new Map<GatewayDefaultSpendLimitScope, string>();
  if (
    callingKey.gatewayAssociation &&
    callingKey._count.gatewaySpendLimits === 0
  ) {
    defaultSubjects.set(
      GATEWAY_DEFAULT_SPEND_LIMIT_SCOPES.API_KEY,
      callingKey.id,
    );
  }
  if (
    userId &&
    !user?.gatewaySpendLimits.some(
      ({ organizationId }) => organizationId === orgId,
    )
  ) {
    defaultSubjects.set(GATEWAY_DEFAULT_SPEND_LIMIT_SCOPES.USER, userId);
  }

  const reported = params.limits.map((limit) => {
    const [spendLimitId = "", subjectId = ""] = limit.limitId.split(
      GATEWAY_DEFAULT_SPEND_LIMIT_ID_SEPARATOR,
    );
    return { ...limit, spendLimitId, subjectId };
  });
  const limits = await prisma.gatewaySpendLimit.findMany({
    where: {
      id: { in: reported.map(({ spendLimitId }) => spendLimitId) },
      organizationId: orgId,
      OR: [
        { apiKeyId: callingKey.id },
        ...(userId ? [{ scope: "USER" as const, userId }] : []),
        { scope: { in: [...defaultSubjects.keys()] } },
      ],
    },
    select: {
      id: true,
      scope: true,
      interval: true,
      limitUsd: true,
      countingStartedAt: true,
      organization: { select: { id: true, name: true } },
      apiKey: {
        select: {
          id: true,
          note: true,
          displaySecretKey: true,
          user: { select: REPORTED_USER_SELECT },
        },
      },
      user: { select: REPORTED_USER_SELECT },
    },
  });
  const keyUser = user && {
    id: user.id,
    email: user.email,
    name: user.name,
  };

  return reported.flatMap(
    ({ spendLimitId, subjectId, countingStartedAt, windowStart }) => {
      const found = limits.find(
        ({ id, countingStartedAt: started }) =>
          id === spendLimitId &&
          started.getTime() === countingStartedAt.getTime(),
      );
      if (!found) return [];
      const { scope, ...limit } = found;
      if (scope === "API_KEY" || scope === "USER") {
        return subjectId === "" && (limit.apiKey || limit.user)
          ? [{ limit, subjectId, windowStart }]
          : [];
      }
      // Not loaded above: reaching an organization limit sends no email.
      if (scope === GATEWAY_ORGANIZATION_SPEND_LIMIT_SCOPE) return [];
      if (defaultSubjects.get(scope) !== subjectId) return [];
      const appliesToKey = scope === GATEWAY_DEFAULT_SPEND_LIMIT_SCOPES.API_KEY;
      return [
        {
          subjectId,
          windowStart,
          limit: {
            ...limit,
            apiKey: appliesToKey
              ? {
                  id: callingKey.id,
                  note: callingKey.note,
                  displaySecretKey: callingKey.displaySecretKey,
                  user: keyUser,
                }
              : null,
            user: appliesToKey ? null : keyUser,
          },
        },
      ];
    },
  );
}

/** The claimed alerts per limit subject, keys before users. */
function groupByScope(claimed: ClaimedAlert[]): ClaimedAlert[][] {
  const groups = new Map<string, ClaimedAlert[]>();
  for (const entry of claimed) {
    const subject = entry.limit.apiKey
      ? `key:${entry.limit.apiKey.id}`
      : `user:${entry.limit.user?.id}`;
    groups.set(subject, [...(groups.get(subject) ?? []), entry]);
  }
  return [...groups.values()];
}

function toEmailScope(limit: ReportedLimit): GatewaySpendLimitEmail["scope"] {
  if (limit.apiKey) {
    return {
      type: "API_KEY",
      apiKeyId: limit.apiKey.id,
      name: limit.apiKey.note ?? "Unnamed key",
      displaySecretKey: limit.apiKey.displaySecretKey,
    };
  }
  const email = limit.user?.email ?? "";
  return {
    type: "USER",
    userId: limit.user?.id ?? "",
    name: limit.user?.name || email,
    email,
  };
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
    scope: toEmailScope(limit),
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
            `${alert.spendLimitId}-${alert.subjectId}-${alert.type}-${alert.countingStartedAt.getTime()}-${alert.windowStart.getTime()}`,
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
