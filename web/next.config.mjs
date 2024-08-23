/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
await import("./src/env.mjs");
import { withSentryConfig } from "@sentry/nextjs";
import { env } from "./src/env.mjs";

/**
 * CSP headers
 * img-src https to allow loading images from SSO providers
 */
const cspHeader = `
  default-src 'self' https://*.langfuse.com https://*.posthog.com https://*.sentry.io wss://*.crisp.chat https://*.crisp.chat;
  script-src 'self' 'unsafe-eval' 'unsafe-inline' https://*.langfuse.com https://client.crisp.chat https://settings.crisp.chat https://challenges.cloudflare.com https://*.sentry.io https://ph.langfuse.com https://static.cloudflareinsights.com https://*.stripe.com;
  style-src 'self' 'unsafe-inline' https://client.crisp.chat;
  img-src 'self' https: blob: data: https://client.crisp.chat https://image.crisp.chat https://storage.crisp.chat;
  font-src 'self' https://client.crisp.chat;
  frame-src 'self' https://challenges.cloudflare.com https://*.stripe.com https://game.crisp.chat;
  worker-src 'self' blob:;
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
  connect-src 'self' https://client.crisp.chat https://storage.crisp.chat wss://client.relay.crisp.chat wss://stream.relay.crisp.chat https://*.ingest.us.sentry.io https://ph.langfuse.com;
  media-src 'self' https://client.crisp.chat;
  ${env.LANGFUSE_CSP_ENFORCE_HTTPS === "true" ? "upgrade-insecure-requests; block-all-mixed-content;" : ""}
  ${env.SENTRY_CSP_REPORT_URI ? `report-uri ${env.SENTRY_CSP_REPORT_URI}; report-to csp-endpoint;` : ""}
`;

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
  transpilePackages: ["@langfuse/shared"],
  reactStrictMode: true,
  experimental: {
    instrumentationHook: true,
    serverComponentsExternalPackages: [
      "dd-trace",
      "@opentelemetry/auto-instrumentations-node",
      "@opentelemetry/api",
    ],
  },
  poweredByHeader: false,

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
        source: "/:path*",
        headers: [
          {
            key: "x-frame-options",
            value: "SAMEORIGIN",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "autoplay=*, fullscreen=*, microphone=*",
          },
          ...(env.SENTRY_CSP_REPORT_URI ? [reportToHeader] : []),
        ],
      },
      {
        source: "/:path((?!api).*)*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: cspHeader.replace(/\n/g, ""),
          },
        ],
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

  // webassembly support for @dqbd/tiktoken
  webpack(config, { isServer }) {
    config.experiments = {
      asyncWebAssembly: true,
      layers: true,
    };

    return config;
  },
};

const sentryOptions = {
  // Additional config options for the Sentry Webpack plugin. Keep in mind that
  // the following options are set automatically, and overriding them is not
  // recommended:
  //   release, url, authToken, configFile, stripPrefix,
  //   urlPrefix, include, ignore

  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  silent: true, // Suppresses all logs

  // For all available options, see:
  // https://github.com/getsentry/sentry-webpack-plugin#options.

  // See the sections below for information on the following options:
  //   'Configure Source Maps':
  //     - disableServerWebpackPlugin
  //     - disableClientWebpackPlugin
  //     - hideSourceMaps
  hideSourceMaps: true,
  //     - widenClientFileUpload
  //   'Configure Legacy Browser Support':
  //     - transpileClientSDK
  //   'Configure Serverside Auto-instrumentation':
  //     - autoInstrumentServerFunctions
  //     - excludeServerRoutes
  //   'Configure Tunneling':
  //     - tunnelRoute

  // An auth token is required for uploading source maps.
  authToken: env.SENTRY_AUTH_TOKEN,
  tunnelRoute: "/api/monitoring-tunnel",
};

export default withSentryConfig(nextConfig, sentryOptions);
