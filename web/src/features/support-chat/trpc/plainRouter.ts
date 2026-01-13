// trpc/plainRouter.ts
import {
  createTRPCRouter,
  authenticatedProcedure,
} from "@/src/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { env } from "@/src/env.mjs";
import { VERSION } from "@/src/constants";
import { nanoid } from "nanoid";

import {
  MessageTypeSchema,
  SeveritySchema,
  TopicSchema,
  TopicGroups,
} from "../formConstants";

import { buildPlainEventSupportRequestMetadataComponents } from "../plain/events/supportRequestMetadataEvent";

import {
  initPlain,
  ensureCustomer,
  createAttachmentUploadUrls,
  createThread as plainCreateSupportThread,
  createThreadEvent,
  replyToThread,
  generateTenantExternalId,
  syncTenantsAndTiers,
  syncCustomerTenantMemberships,
  type SessionUser,
  type Organization,
} from "../plain/plainClient";
import { PLAIN_MAX_FILE_SIZE_BYTES } from "../plain/plainConstants";

// =========================
// Input Schemas
// =========================
const CreateSupportThreadInput = z.object({
  messageType: MessageTypeSchema,
  severity: SeveritySchema,
  topic: TopicSchema,
  message: z.string().trim().min(1),
  url: z.string().url().optional(),
  organizationId: z.string().optional(),
  projectId: z.string().optional(),
  browserMetadata: z.record(z.any()).optional(),
  integrationType: z.string().optional(),
  /** IDs of attachments already uploaded via prepareAttachmentUploads */
  attachmentIds: z.array(z.string()).optional(),
});

const PrepareAttachmentUploadsInput = z.object({
  files: z
    .array(
      z.object({
        fileName: z.string().min(1),
        fileSizeBytes: z.number().int().positive(),
      }),
    )
    .max(
      5,
      `Maximum 5 files allowed (each ≤ ${(PLAIN_MAX_FILE_SIZE_BYTES / (1024 * 1024)).toFixed(0)}MB)`,
    )
    .refine(
      (files) =>
        files.every((f) => f.fileSizeBytes <= PLAIN_MAX_FILE_SIZE_BYTES),
      {
        message: `Each file must be ≤ ${(PLAIN_MAX_FILE_SIZE_BYTES / (1024 * 1024)).toFixed(0)}MB`,
      },
    )
    .refine(
      (files) =>
        files.reduce((sum, f) => sum + f.fileSizeBytes, 0) <= 50 * 1024 * 1024,
      { message: "Total attachment size must be ≤ 50MB" },
    )
    .optional()
    .default([]),
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

function deriveOrganizationFromProject(user: SessionUser, projectId?: string) {
  if (!projectId || !Array.isArray(user.organizations)) return undefined;
  for (const org of user.organizations as Organization[]) {
    if (org.projects?.some((p) => p.id === projectId)) return org;
  }
  return undefined;
}

// =========================
/** Router */
// =========================
export const plainRouter = createTRPCRouter({
  /**
   * Prepare presigned S3 upload forms for attachments.
   * - Ensures customer exists (returns customerId)
   * - Returns uploadFormUrl + uploadFormData + attachmentId per file
   */
  prepareAttachmentUploads: authenticatedProcedure
    .input(PrepareAttachmentUploadsInput)
    .mutation(async ({ ctx, input }) => {
      const email = ctx.session.user.email;
      const fullName = ctx.session.user.name ?? undefined;
      if (!email) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "User email required to prepare attachment uploads.",
        });
      }

      const plain = initPlain({ apiKey: env.PLAIN_API_KEY });
      const customerId = await ensureCustomer(plain, { email, fullName });
      const uploads = await createAttachmentUploadUrls(
        plain,
        customerId,
        input.files,
      );

      return {
        customerId,
        uploads,
      };
    }),

  /**
   * Creates a thread after synchronously ensuring:
   *  (1) Upsert customer
   *  (2) Ensure tenants/tiers & sync tenant memberships
   *  (3) Create thread WITH threadFields (+ attachments if provided)
   *      - If this fails, retry creating the thread WITHOUT threadFields (attachments still included)
   *  (4) Fire-and-forget: create a compact "Support request metadata" thread event
   *      using the new UI builder (Url, Organization ID, Project ID, Version, Plan, Cloud Region, Browser Metadata).
   */
  createSupportThread: authenticatedProcedure
    .input(CreateSupportThreadInput)
    .mutation(async ({ ctx, input }) => {
      const email = ctx.session.user.email;
      const fullName = ctx.session.user.name ?? undefined;
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
        tenantExternalId: undefined as string | undefined,
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

      if (
        currentSupportRequestContext.organizationId &&
        currentSupportRequestContext.region
      ) {
        currentSupportRequestContext.tenantExternalId =
          generateTenantExternalId(
            currentSupportRequestContext.organizationId,
            currentSupportRequestContext.region,
          );
      }

      const plain = initPlain({ apiKey: env.PLAIN_API_KEY });

      // (1) Ensure customer
      const customerId = await ensureCustomer(plain, { email, fullName });

      // (2) Ensure tenants/tiers and sync memberships — best-effort
      const demoOrgId = env.NEXT_PUBLIC_DEMO_ORG_ID;
      if (currentSupportRequestContext.region) {
        await syncTenantsAndTiers(plain, {
          user: ctx.session.user as SessionUser,
          region: currentSupportRequestContext.region,
          demoOrgId,
        });
        await syncCustomerTenantMemberships(plain, {
          email,
          customerId,
          user: ctx.session.user as SessionUser,
          region: currentSupportRequestContext.region,
        });
      }

      const { topLevel, subtype } = splitTopic(input.topic);

      // (3) Create thread (no initial message; with fallback inside)
      // Generate a short unique identifier to prevent Gmail from merging threads
      const uniqueId = nanoid(5);
      const { threadId, createdAt, status, createdWithThreadFields } =
        await plainCreateSupportThread(plain, {
          email,
          title: `[${uniqueId}] ${input.messageType}: ${input.topic} • ${topLevel}/${subtype}`,
          messageType: input.messageType,
          severity: input.severity,
          topicTopLevel: topLevel,
          topicSubtype: subtype,
          url: input.url,
          tenantExternalId: currentSupportRequestContext.tenantExternalId,
          integrationType: input.integrationType,
        });

      try {
        const { title: eventTitle, components: eventComponents } =
          buildPlainEventSupportRequestMetadataComponents({
            userEmail: email,
            url: input.url,
            organizationId: currentSupportRequestContext.organizationId,
            projectId: currentSupportRequestContext.projectId,
            version: VERSION,
            plan: currentSupportRequestContext.plan,
            cloudRegion: currentSupportRequestContext.region,
            browserMetadata: input.browserMetadata,
          });

        await createThreadEvent(plain, {
          threadId,
          title: eventTitle,
          components: eventComponents,
          externalId: `support-metadata:${threadId}`,
        });
      } catch {
        // best-effort; errors are logged in helpers
      }

      // (5) Write user email as part of first reply to trigger email
      await replyToThread(plain, {
        threadId,
        userEmail: email,
        originalMessage: [
          "Hi there,",
          "",
          " thanks for reaching out! We've received your request and will follow up as soon as possible.",
          "",
          "To help us move faster, feel free to reply to this email with:",
          "- any error messages or screenshots",
          "- links to where you're seeing the issue (trace, page, dataset)",
          "- steps to reproduce (if relevant)",
          "",
          "Thanks,",
          "",
          "Team Langfuse",
          "",
          "",
          "=============================================================================================",
          "",
          "",
          `${email} wrote:`,
          "",
          input.message,
          "",
          "=============================================================================================",
          "",
        ].join("\n"),
        attachmentIds: input.attachmentIds ?? [],
        impersonate: false,
      });

      return {
        threadId,
        customerId,
        status,
        createdAt,
        createdWithThreadFields,
        attachmentCount: (input.attachmentIds ?? []).length,
      };
    }),
});
