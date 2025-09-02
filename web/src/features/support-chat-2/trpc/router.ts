import { createTRPCRouter, protectedProcedure } from "@/src/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { PlainClient, ThreadFieldSchemaType } from "@team-plain/typescript-sdk";
import {
  MessageTypeSchema,
  SeveritySchema,
  TopicSchema,
  TopicGroups,
} from "../formConstants";

// Toggle extra logging
const DEBUG_PLAIN = true;
const DIAG_MODE_ON_CREATE_FAIL = true; // try create(without fields) + upserts if createThread fails

function getPlainClient() {
  const apiKey = process.env.PLAIN_API_KEY;
  if (!apiKey) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Missing PLAIN_API_KEY",
    });
  }
  return new PlainClient({ apiKey });
}

/** Keys must match what you configured in Plain */
const THREAD_FIELDS = {
  messageType: "message_type", // Enum (Dropdown)
  severity: "severity", // Enum
  topic: "topic", // Enum ("Operations" | "Product Features")
  topicOperationsSubtype: "operations_subtype",
  topicProductFeaturesSubtype: "product_features_subtype",
  browserMetadata: "browser_metadata", // Text
  organizationId: "organization_id", // Text
  projectId: "project_id", // Text
  url: "url", // Text
  version: "version", // Text
  plan: "plan", // Text
  cloudRegion: "cloud_region", // Text
} as const;

const CreateSupportThreadInput = z.object({
  messageType: MessageTypeSchema,
  severity: SeveritySchema,
  topic: TopicSchema,
  message: z.string().trim().min(10),
  url: z.string().url().optional(),
  projectId: z.string().optional(),
  version: z.string().optional(),
  plan: z.string().optional(),
  cloudRegion: z.string().optional().nullable(), // might be self-hosted
  browserMetadata: z.record(z.any()).optional(),
});

/** Debug helpers */
function logDebug(label: string, data: unknown) {
  if (!DEBUG_PLAIN) return;
  // eslint-disable-next-line no-console
  console.log(`[plain.debug] ${label}`, data);
}
function logError(label: string, error: unknown) {
  // eslint-disable-next-line no-console
  console.error(`[plain.error] ${label}`, error);
}
function describeSdkError(err: unknown) {
  // Best-effort extraction of useful details
  const e = err as any;
  const shape = {
    name: e?.name,
    message: e?.message,
    type: e?.type, // for MutationError
    code: e?.code, // for MutationError
    fields: e?.fields, // array of field errors
    errorDetails: e?.errorDetails, // extra info for MutationError
    status: e?.status, // http-ish code
  };
  return shape;
}

/** unwrap with rich logging */
function unwrap<T>(label: string, res: { data?: T; error?: unknown }): T {
  if (res.error) {
    const details = describeSdkError(res.error);
    logError(`${label} failed`, details);
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `${label} failed`,
      cause: res.error,
    });
  }
  if (!res.data) {
    logError(`${label} returned no data`, res);
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `${label} returned no data`,
    });
  }
  logDebug(
    `${label} ok`,
    Array.isArray(res.data) ? { length: (res.data as any[]).length } : res.data,
  );
  return res.data;
}

/** Utilities */
function splitTopic(topic: z.infer<typeof TopicSchema>): {
  topLevel: "Operations" | "Product Features";
  subtype: string;
} {
  if ((TopicGroups.Operations as readonly string[]).includes(topic)) {
    return { topLevel: "Operations", subtype: topic };
  }
  return { topLevel: "Product Features", subtype: topic };
}

/** Build threadFields array (for logging / createThread) */
function buildThreadFields(input: z.infer<typeof CreateSupportThreadInput>) {
  const { topLevel, subtype } = splitTopic(input.topic);

  const enumFields = [
    {
      key: THREAD_FIELDS.messageType,
      type: ThreadFieldSchemaType.Enum,
      stringValue: input.messageType,
    },
    {
      key: THREAD_FIELDS.severity,
      type: ThreadFieldSchemaType.Enum,
      stringValue: input.severity,
    },
    {
      key: THREAD_FIELDS.topic,
      type: ThreadFieldSchemaType.Enum,
      stringValue: topLevel,
    },
    ...(topLevel === "Operations" && THREAD_FIELDS.topicOperationsSubtype
      ? [
          {
            key: THREAD_FIELDS.topicOperationsSubtype,
            type: ThreadFieldSchemaType.Enum,
            stringValue: subtype,
          } as const,
        ]
      : []),
    ...(topLevel === "Product Features" &&
    THREAD_FIELDS.topicProductFeaturesSubtype
      ? [
          {
            key: THREAD_FIELDS.topicProductFeaturesSubtype,
            type: ThreadFieldSchemaType.Enum,
            stringValue: subtype,
          } as const,
        ]
      : []),
  ];

  const textFields = [
    input.url && {
      key: THREAD_FIELDS.url,
      type: ThreadFieldSchemaType.String,
      stringValue: input.url,
    },
    input.projectId && {
      key: THREAD_FIELDS.projectId,
      type: ThreadFieldSchemaType.String,
      stringValue: input.projectId,
    },
    input.version && {
      key: THREAD_FIELDS.version,
      type: ThreadFieldSchemaType.String,
      stringValue: input.version,
    },
    input.plan && {
      key: THREAD_FIELDS.plan,
      type: ThreadFieldSchemaType.String,
      stringValue: input.plan,
    },
    input.cloudRegion && {
      key: THREAD_FIELDS.cloudRegion,
      type: ThreadFieldSchemaType.String,
      stringValue: input.cloudRegion,
    },
    input.browserMetadata && {
      key: THREAD_FIELDS.browserMetadata,
      type: ThreadFieldSchemaType.String,
      stringValue: JSON.stringify(input.browserMetadata),
    },
  ].filter(Boolean) as {
    key: string;
    type: ThreadFieldSchemaType;
    stringValue?: string;
  }[];

  return { enumFields, textFields, all: [...enumFields, ...textFields] };
}

export const plainRouter = createTRPCRouter({
  createSupportThread: protectedProcedure
    .input(CreateSupportThreadInput)
    .mutation(async ({ ctx, input }) => {
      const client = getPlainClient();

      logDebug("env check PLAIN_API_KEY set", !!process.env.PLAIN_API_KEY);
      logDebug("session.user", ctx.session.user);
      logDebug("input", input);

      const email = ctx.session.user.email;
      const fullName = ctx.session.user.name ?? undefined;
      if (!email) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "User email required to create a support thread.",
        });
      }

      // 1) Upsert customer
      const upsert = await client.upsertCustomer({
        identifier: { emailAddress: email },
        onCreate: {
          fullName: fullName ?? "",
          email: { email, isVerified: true },
        },
        onUpdate: {
          fullName: fullName ? { value: fullName } : undefined,
          email: { email, isVerified: true },
        },
      });
      const upsertData = unwrap("upsertCustomer", upsert);
      const customerId = upsertData.customer?.id;
      if (!customerId) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Plain did not return a customer id.",
        });
      }

      // 2) Prepare thread payload
      const { enumFields, textFields, all } = buildThreadFields(input);
      const title = `${input.messageType}: ${input.topic}`;
      const components = [{ componentText: { text: input.message } }];

      logDebug("createThread payload", {
        title,
        customerIdentifier: { emailAddress: email },
        components,
        threadFields: all,
      });

      // 3) Try createThread with fields
      const created = await client.createThread({
        title,
        customerIdentifier: { emailAddress: email },
        components,
        threadFields: all,
      });

      if (created.error && DIAG_MODE_ON_CREATE_FAIL) {
        // Log rich error and then fall back to diagnostic mode
        logError(
          "createThread failed (with fields)",
          describeSdkError(created.error),
        );

        // Create thread WITHOUT fields for diagnosis
        const createdBare = await client.createThread({
          title,
          customerIdentifier: { emailAddress: email },
          components,
        });
        if (createdBare.error) {
          logError(
            "createThread (bare) failed",
            describeSdkError(createdBare.error),
          );
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "createThread failed (bare)",
            cause: createdBare.error,
          });
        }
        const threadBare = createdBare.data!;
        const threadId = threadBare.id;
        logDebug("createThread (bare) ok", { threadId });

        // Upsert enum fields one by one
        for (const f of enumFields) {
          logDebug("upsertThreadField (enum) ->", f);
          const r = await client.upsertThreadField({
            identifier: { key: f.key, threadId },
            type: f.type,
            stringValue: f.stringValue,
          });
          if (r.error) {
            logError(
              `upsertThreadField enum failed key=${f.key}`,
              describeSdkError(r.error),
            );
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `upsertThreadField failed for enum key=${f.key}`,
              cause: r.error,
            });
          }
        }

        // Upsert text fields one by one
        for (const f of textFields) {
          logDebug("upsertThreadField (text) ->", f);
          const r = await client.upsertThreadField({
            identifier: { key: f.key, threadId },
            type: f.type,
            stringValue: f.stringValue,
          });
          if (r.error) {
            logError(
              `upsertThreadField text failed key=${f.key}`,
              describeSdkError(r.error),
            );
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `upsertThreadField failed for text key=${f.key}`,
              cause: r.error,
            });
          }
        }

        return {
          threadId,
          customerId,
          status: threadBare.status,
          createdAt:
            threadBare.createdAt?.__typename === "DateTime"
              ? threadBare.createdAt.iso8601
              : undefined,
          diagnostics: "created thread bare + upserted fields individually",
        };
      }

      // If we got here, either created is OK or we want unwrap to throw
      const thread = unwrap("createThread", created);

      return {
        threadId: thread.id,
        customerId,
        status: thread.status,
        createdAt:
          thread.createdAt?.__typename === "DateTime"
            ? thread.createdAt.iso8601
            : undefined,
      };
    }),
});
