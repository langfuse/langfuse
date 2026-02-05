/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
await import("./src/env.mjs");
import { withSentryConfig } from "@sentry/nextjs";
import { env } from "./src/env.mjs";
import bundleAnalyzer from "@next/bundle-analyzer";

/**
 * CSP headers
 * img-src https to allow loading images from SSO providers
 */
const cspHeader = `
  default-src 'self' https://*.langfuse.com https://*.langfuse.dev https://*.posthog.com https://*.sentry.io;
  script-src 'self' 'unsafe-eval' 'unsafe-inline' https://*.langfuse.com https://*.langfuse.dev https://challenges.cloudflare.com https://*.sentry.io  https://static.cloudflareinsights.com https://*.stripe.com https://login.microsoftonline.com https://login.microsoft.com https://*.microsoftonline.com;
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://login.microsoftonline.com https://login.microsoft.com https://*.microsoftonline.com;
  img-src 'self' https: blob: data: http://localhost:* https://prod-uk-services-workspac-workspacefilespublicbuck-vs4gjqpqjkh6.s3.amazonaws.com https://prod-uk-services-attachm-attachmentsbucket28b3ccf-uwfssb4vt2us.s3.eu-west-2.amazonaws.com https://i0.wp.com;
  font-src 'self';
  frame-src 'self' https://challenges.cloudflare.com https://*.stripe.com https://login.microsoftonline.com https://login.microsoft.com https://*.microsoftonline.com;
  worker-src 'self' blob:;
  object-src 'none';
  base-uri 'self';
  form-action 'self' https://login.microsoftonline.com https://login.microsoft.com https://*.microsoftonline.com;
  frame-ancestors 'none';
  connect-src 'self' https://*.langfuse.com https://*.langfuse.dev https://*.ingest.us.sentry.io https://*.sentry.io https://chat.uk.plain.com https://*.s3.amazonaws.com https://prod-uk-services-attachm-attachmentsuploadbucket2-1l2e4906o2asm.s3.eu-west-2.amazonaws.com https://login.microsoftonline.com https://login.microsoft.com https://*.microsoftonline.com https://graph.microsoft.com;
  media-src 'self' https: http://localhost:*;
  ${env.LANGFUSE_CSP_ENFORCE_HTTPS === "true" ? "upgrade-insecure-requests; block-all-mixed-content;" : ""}
  ${env.SENTRY_CSP_REPORT_URI ? `report-uri ${env.SENTRY_CSP_REPORT_URI}; report-to csp-endpoint;` : ""}
`;

// Match rules for Hugging Face
const huggingFaceHosts = ["huggingface.co", ".*\\.hf\\.space$"];

const reportToHeader = {
  key: "Report-To",
  value: JSON.stringify({
    group: "csp-endpoint",
    max_age: 10886400,
    endpoints: [
      {
        url: env.SENTRY_CSP_REPORT_URI,
      },
    ],
    include_subdomains: true,
  }),
};

/** @type {import("next").NextConfig} */
const nextConfig = {
  // Allow building to alternate directory for parallel build checks while dev server runs
  distDir: process.env.NEXT_DIST_DIR || ".next",
  staticPageGenerationTimeout: 500, // default is 60. Required for build process for amd
  transpilePackages: ["@langfuse/shared", "vis-network/standalone"],
  reactStrictMode: true,
  serverExternalPackages: [
    "dd-trace",
    "@opentelemetry/api",
    "@appsignal/opentelemetry-instrumentation-bullmq",
    "bullmq",
    "@opentelemetry/sdk-node",
    "@opentelemetry/instrumentation-winston",
    "kysely",
    "everything-json",
  ],
  poweredByHeader: false,
  basePath: env.NEXT_PUBLIC_BASE_PATH,
  turbopack: {
    resolveAlias: {
      "@langfuse/shared": "./packages/shared/src",
      // this is an ugly hack to get turbopack to work with react-resizable, used in the
      // web/src/features/widgets/components/DashboardGrid.tsx file. This **only** affects
      // the dev server. The CSS is included in the non-turbopack based prod build anyways.
      // Also not needed for the non-turbopack based dev server.
      "react-resizable/css/styles.css":
        "../node_modules/.pnpm/react-resizable@3.0.5_react-dom@19.2.3_react@19.2.3__react@19.2.3/node_modules/react-resizable/css/styles.css",
    },
  },
  experimental: {
    browserDebugInfoInTerminal: true, // Logs browser logs to terminal
    // TODO: enable with new next version! 15.6
    // see: https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopackPersistentCaching
    // turbopackPersistentCaching: true,
  },

  /**
   * If you have `experimental: { appDir: true }` set, then you must comment the below `i18n` config
   * out.
   *
   * @see https://github.com/vercel/next.js/issues/41980
   */
  i18n: {
    locales: ["en"],
    defaultLocale: "en",
  },
  output: "standalone",

  async headers() {
    return [
      {
        // Add noindex for all pages except root and /auth*
        source: "/:path((?!auth|^$).*)*",
        headers: [
          {
            key: "X-Robots-Tag",
            value: "noindex",
          },
        ],
      },
      {
        source: "/:path*",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Document-Policy",
            value: "js-profiling",
          },
          {
            key: "Permissions-Policy",
            value: "autoplay=*, fullscreen=*, microphone=*",
          },
          ...(env.SENTRY_CSP_REPORT_URI ? [reportToHeader] : []),
        ],
      },
      {
        source: "/:path*",
        headers: [
          {
            key: "x-frame-options",
            value: "SAMEORIGIN",
          },
        ],
        // Disable x-frame-options on Hugging Face to allow for embedded use of Langfuse
        missing: huggingFaceHosts.map((host) => ({
          type: "host",
          value: host,
        })),
      },
      // CSP header
      {
        source: "/:path((?!api).*)*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: cspHeader.replace(/\n/g, ""),
          },
        ],
        // Disable CSP on Hugging Face to allow for embedded use of Langfuse
        missing: huggingFaceHosts.map((host) => ({
          type: "host",
          value: host,
        })),
      },
      // Required to check authentication status from langfuse.com
      ...(env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION !== undefined
        ? [
            {
              source: "/api/auth/session",
              headers: [
                {
                  key: "Access-Control-Allow-Origin",
                  value: "https://langfuse.com",
                },
                { key: "Access-Control-Allow-Credentials", value: "true" },
                { key: "Access-Control-Allow-Methods", value: "GET,POST" },
                {
                  key: "Access-Control-Allow-Headers",
                  value: "Content-Type, Authorization",
                },
              ],
            },
          ]
        : []),
      // all files in /public/generated are public and can be accessed from any origin, e.g. to render an API reference based on our openapi schema
      {
        source: "/generated/:path*",
        headers: [
          {
            key: "Access-Control-Allow-Origin",
            value: "*",
          },
          {
            key: "Access-Control-Allow-Methods",
            value: "GET",
          },
        ],
      },
    ];
  },

  webpack(config, { isServer }) {
    // Exclude Datadog packages from webpack bundling to avoid issues
    // see: https://docs.datadoghq.com/tracing/trace_collection/automatic_instrumentation/dd_libraries/nodejs/#bundling-with-nextjs
    config.externals.push("@datadog/pprof", "dd-trace");
    // Exclude everything-json (native addon) from webpack bundling
    if (isServer) {
      config.externals.push("everything-json");
    }
    return config;
  },
};

const sentryConfig = withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://github.com/getsentry/sentry-webpack-plugin#options

  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  authToken: env.SENTRY_AUTH_TOKEN,

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Automatically annotate React components to show their full name in breadcrumbs and session replay
  reactComponentAnnotation: {
    enabled: true,
  },

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  // tunnelRoute: "/api/monitoring-tunnel",

  // Hides source maps from generated client bundles
  sourcemaps: {
    disable: true,
  },

  // Automatically tree-shake Sentry logger statements to reduce bundle size
  disableLogger: true,

  // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
  // See the following for more information:
  // https://docs.sentry.io/product/crons/
  // https://vercel.com/docs/cron-jobs
  automaticVercelMonitors: false,
});

// Enable bundle analyzer in analyze mode, otherwise use standard config
const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
  openAnalyzer: true, // Open analyzer in browser
});

export default withBundleAnalyzer(sentryConfig);
