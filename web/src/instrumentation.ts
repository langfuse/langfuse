import { jsonSchema } from "@langfuse/shared";
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { nodeProfilingIntegration } = await import("@sentry/profiling-node");

    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      integrations: [nodeProfilingIntegration(), Sentry.prismaIntegration()],

      // Set tracesSampleRate to 1.0 to capture 100%
      // of transactions for performance monitoring.
      // We recommend adjusting this value in production
      tracesSampler: (samplingContext) => {
        if (
          samplingContext.request &&
          samplingContext.request.url &&
          samplingContext.request.url.includes("api/trpc")
        ) {
          return 0.1;
        }
        if (
          samplingContext.request &&
          samplingContext.request.url &&
          samplingContext.request.url.includes("api/auth")
        ) {
          return 0.1;
        }
        return 0.01;
      },

      profilesSampleRate: 0.1,

      // filter out passwords from the signup request body
      // transaction events are sentry transactions which include logs and spans.
      beforeSendTransaction(transaction) {
        if (
          transaction.request &&
          typeof transaction.request.data === "string" &&
          transaction.request.url &&
          transaction.request.url.includes("api/auth/signup")
        ) {
          const jsonBody = jsonSchema.safeParse(transaction.request.data);

          if (
            jsonBody.success &&
            typeof jsonBody.data === "object" &&
            "data" in jsonBody.data
          ) {
            delete jsonBody.data.password;
            transaction.request.data = JSON.stringify(jsonBody.data);
            transaction.request.data = JSON.stringify(jsonBody);
          } else {
            console.log("Signup: Non Json Request body");
          }

          return transaction;
        }

        return transaction;
      },
    });
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    const { nodeProfilingIntegration } = await import("@sentry/profiling-node");

    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      integrations: [nodeProfilingIntegration()],
      tracesSampleRate: 0.1,
    });
  }
}
