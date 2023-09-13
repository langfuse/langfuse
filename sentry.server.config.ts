import { prisma } from "@/src/server/db";
import * as Sentry from "@sentry/nextjs";
import { ProfilingIntegration } from "@sentry/profiling-node";

if (process.env.NEXT_PUBLIC_SENTRY_DSN)
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

    // Set tracesSampleRate to 1.0 to capture 100%
    // of transactions for performance monitoring.
    // We recommend adjusting this value in production
    tracesSampleRate: 1.0,

    profilesSampleRate: 1.0, // Profiling sample rate is relative to tracesSampleRate
    integrations: [
      // Add profiling integration to list of integrations
      new ProfilingIntegration(),
      new Sentry.Integrations.Prisma({ client: prisma }),
    ],

    // ...

    // Note: if you want to override the automatic release value, do not set a
    // `release` value here - use the environment variable `SENTRY_RELEASE`, so
    // that it will also get attached to your source maps
  });
