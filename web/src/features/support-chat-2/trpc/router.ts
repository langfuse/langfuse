import { createTRPCRouter, protectedProcedure } from "@/src/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { env } from "@/src/env.mjs";
import { logger } from "@langfuse/shared/src/server";
import { PlainClient, ThreadFieldSchemaType } from "@team-plain/typescript-sdk";
import { z } from "zod";

const plainClient = env.PLAIN_API_KEY
  ? new PlainClient({ apiKey: env.PLAIN_API_KEY })
  : null;

export const supportChat2Router = createTRPCRouter({
  createSupportThread: protectedProcedure
    .input(
      z.object({
        messageType: z
          .enum(["Question", "Feedback", "Bug"])
          .default("Question"),
        topic: z.enum([
          "Billing / Usage",
          "Account Changes",
          "Account Deletion",
          "Slack Connect Channel",
          "Inviting Users",
          "Tracing",
          "Prompt Management",
          "Evals",
          "Platform",
        ]),
        severity: z.enum([
          "Question or feature request",
          "Feature not working as expected",
          "Feature is not working at all",
          "Outage, data loss, or data breach",
        ]),
        message: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const { session } = ctx;
        const user = session.user;
        const email = user.email;

        if (!env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) return;

        if (!email) {
          logger.error("User email is required to create a support thread");
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Missing user email",
          });
        }

        if (!plainClient) {
          logger.error("Plain.com client not configured");
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Support system is not configured",
          });
        }

        // Ensure customer exists in Plain
        const upsert = await plainClient.upsertCustomer({
          identifier: { emailAddress: email },
          onCreate: {
            email: { email, isVerified: true },
            fullName: user.name ?? "",
          },
          onUpdate: {
            email: { email, isVerified: true },
          },
        });
        const customerId = upsert.data?.customer.id;
        if (!customerId) {
          logger.error("Failed to upsert customer in Plain.com", upsert.error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Could not initialize support profile",
          });
        }

        const components = [
          {
            componentText: {
              text: `Type: ${input.messageType}\nTopic: ${input.topic}\nSeverity: ${input.severity}\n\n${input.message}`,
            },
          },
        ];

        const threadFields = [
          {
            key: "message_type",
            type: ThreadFieldSchemaType.String,
            stringValue: input.messageType,
          },
          {
            key: "topic",
            type: ThreadFieldSchemaType.String,
            stringValue: input.topic,
          },
          {
            key: "severity",
            type: ThreadFieldSchemaType.String,
            stringValue: input.severity,
          },
          {
            key: "cloud_region",
            type: ThreadFieldSchemaType.String,
            stringValue: env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
          },
        ];

        const title = `Support: ${input.messageType}`;

        const res = await plainClient.createThread({
          title,
          customerIdentifier: { emailAddress: email },
          components,
          threadFields,
        });

        if (res.error) {
          logger.error("Failed to create Plain.com thread", res.error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to create support ticket",
          });
        }

        return { id: res.data.id };
      } catch (error) {
        logger.error("Failed to submit support ticket", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to submit support ticket",
          cause: error,
        });
      }
    }),
});
