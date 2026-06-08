// trpc/supportRouter.ts
import {
  createTRPCRouter,
  authenticatedProcedure,
} from "@/src/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { env } from "@/src/env.mjs";
import { VERSION } from "@/src/constants";
import { nanoid } from "nanoid";
import { logger } from "@langfuse/shared/src/server";

import {
  MessageTypeSchema,
  SeveritySchema,
  TopicSchema,
  TopicGroups,
  isHighTierSupportPlan,
} from "../formConstants";

import {
  createPylonIssue,
  buildPylonIssueBodyHtml,
  buildPylonMetadataString,
  mapSeverityToPylonPriority,
  updatePylonAccountCustomFields,
  mapPlanToPylonCustomerTier,
  mapToPylonCaseSeverity,
  mapMessageTypeToPylonQuestionType,
} from "../pylon/pylonClient";

// =========================
// Input Schemas
// =========================
const CreateSupportThreadInput = z.object({
  messageType: MessageTypeSchema,
  severity: SeveritySchema,
  /** Manual Sev-1 escalation; only honored for high-tier plans (enforced below). */
  isHighPriority: z.boolean().optional(),
  topic: TopicSchema,
  message: z.string().trim().min(1),
  url: z.url().optional(),
  organizationId: z.string().optional(),
  projectId: z.string().optional(),
  browserMetadata: z.record(z.string(), z.any()).optional(),
  integrationType: z.string().optional(),
  /** URLs of attachments already uploaded to Pylon */
  pylonAttachmentUrls: z.array(z.url()).optional(),
});

// =========================
// Local domain helpers
// =========================
function splitTopic(topic: z.infer<typeof TopicSchema>): {
  topLevel: "Operations" | "Product Features";
  subtype: string;
} {
  if ((TopicGroups.Operations as readonly string[]).includes(topic)) {
    return { topLevel: "Operations", subtype: topic };
  }
  return { topLevel: "Product Features", subtype: topic };
}

type SessionUser = {
  organizations: Organization[];
};

type Organization = {
  id: string;
  plan?: string;
  projects?: { id: string }[];
};

function deriveOrganizationFromProject(user: SessionUser, projectId?: string) {
  if (!projectId || !Array.isArray(user.organizations)) return undefined;
  for (const org of user.organizations) {
    if (org.projects?.some((p) => p.id === projectId)) return org;
  }
  return undefined;
}

// =========================
/** Router */
// =========================
export const supportRouter = createTRPCRouter({
  /**
   * Creates a support thread in Pylon.
   *  (1) Resolve the organization/plan from the provided org or project
   *  (2) Create the issue in Pylon (best-effort, blocking)
   *  (3) Update the Pylon account's customer tier custom field (best-effort)
   */
  createSupportThread: authenticatedProcedure
    .input(CreateSupportThreadInput)
    .mutation(async ({ ctx, input }) => {
      const email = ctx.session.user.email;
      const fullName = getFullName(ctx.session.user);
      if (!email) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "User email required to create a support thread.",
        });
      }

      const currentSupportRequestContext = {
        organizationId: input.organizationId,
        projectId: input.projectId,
        region: env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
        plan: undefined as string | undefined,
      };

      // Validate that, if organizationId is provided the user has access to it
      if (input.organizationId) {
        const organization = ctx.session.user.organizations.find(
          (o) => o.id === input.organizationId,
        );

        if (!organization) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Organization not found.",
          });
        }

        currentSupportRequestContext.plan = organization.plan;

        if (input.projectId) {
          // Validate that, if projectId is provided the user has access to it
          if (!organization.projects?.some((p) => p.id === input.projectId)) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Project not found.",
            });
          }
        }
      }

      // Validate that, if organizationId is NOT provided the user has access to the project
      if (!input.organizationId && input.projectId) {
        const organization = deriveOrganizationFromProject(
          ctx.session.user as SessionUser,
          input.projectId,
        );
        if (!organization) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Organization not found.",
          });
        }

        currentSupportRequestContext.plan = organization.plan;
        currentSupportRequestContext.organizationId = organization.id;
      }

      // Only honor a manual high-priority request for high-tier plans; ignore
      // the client-supplied flag otherwise so it cannot be used to force Sev-1.
      const honorHighPriority =
        input.isHighPriority === true &&
        isHighTierSupportPlan(currentSupportRequestContext.plan);

      const { topLevel, subtype } = splitTopic(input.topic);

      // Generate a short unique identifier to prevent Gmail from merging threads
      const uniqueId = nanoid(5);

      // Create issue in Pylon (best-effort, blocking)
      let pylonIssueFailed = false;
      if (!env.PYLON_API_KEY) {
        pylonIssueFailed = true;
        logger.error(
          "Pylon integration is not configured (PYLON_API_KEY missing); cannot create support thread",
        );
      } else {
        try {
          const pylonTitle = `[${uniqueId}] ${input.messageType}: ${input.topic} • ${topLevel}/${subtype}`;
          const pylonBodyHtml = buildPylonIssueBodyHtml({
            message: input.message,
            requesterEmail: email,
          });
          const pylonMetadata = buildPylonMetadataString({
            messageType: input.messageType,
            severity: input.severity,
            topic: input.topic,
            integrationType: input.integrationType,
            url: input.url,
            organizationId: currentSupportRequestContext.organizationId,
            projectId: currentSupportRequestContext.projectId,
            plan: currentSupportRequestContext.plan,
            cloudRegion: currentSupportRequestContext.region,
            version: VERSION,
            browserMetadata: input.browserMetadata,
          });
          const pylonCustomerTier = currentSupportRequestContext.plan
            ? mapPlanToPylonCustomerTier(currentSupportRequestContext.plan)
            : undefined;
          const pylonIssue = await createPylonIssue({
            apiKey: env.PYLON_API_KEY,
            title: pylonTitle,
            bodyHtml: pylonBodyHtml,
            requesterEmail: email,
            requesterName: fullName,
            tags: ["Langfuse"],
            priority: honorHighPriority
              ? "urgent"
              : mapSeverityToPylonPriority(input.severity),
            attachmentUrls: input.pylonAttachmentUrls,
            customFields: [
              ...(input.url
                ? [{ slug: "langfuse_page_url", value: input.url }]
                : []),
              {
                slug: "question_type",
                values: [mapMessageTypeToPylonQuestionType(input.messageType)],
              },
              { slug: "langfuse_topic", value: input.topic },
              ...(input.integrationType
                ? [
                    {
                      slug: "langfuse_integration_type",
                      value: input.integrationType,
                    },
                  ]
                : []),
              { slug: "langfuse_metadata", value: pylonMetadata },
              {
                slug: "case_severity",
                value: mapToPylonCaseSeverity({
                  severity: input.severity,
                  plan: currentSupportRequestContext.plan,
                  isHighPriority: honorHighPriority,
                }),
              },
            ],
          });

          const pylonAccountId = pylonIssue.data?.account?.id;
          if (pylonAccountId && pylonCustomerTier) {
            try {
              await updatePylonAccountCustomFields({
                apiKey: env.PYLON_API_KEY,
                accountId: pylonAccountId,
                customFields: [
                  {
                    slug: "langfuse_customer_tier",
                    value: pylonCustomerTier,
                  },
                ],
              });
            } catch (e) {
              logger.error(
                "Pylon account custom field update failed (best-effort)",
                e,
              );
            }
          }
        } catch (e) {
          pylonIssueFailed = true;
          logger.error("Pylon issue creation failed", e);
        }
      }

      return {
        pylonIssueFailed,
      };
    }),
});

function getFullName(user: {
  name?: string | null;
  email?: string | null;
  id: string;
}): string {
  const { name, email } = user ?? {};

  if (name?.trim()) return name;

  if (email) {
    const emailUserName = email.split("@")[0];

    if (emailUserName) return emailUserName;
  }

  return user?.id.slice(0, 8) ?? "Anonymous";
}
