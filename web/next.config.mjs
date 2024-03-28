/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
await import("./src/env.mjs");
import { withSentryConfig } from "@sentry/nextjs";
import { env } from "./src/env.mjs";

/** @type {import("next").NextConfig} */
const nextConfig = {
  transpilePackages: ["@langfuse/shared"],
  reactStrictMode: true,

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
    ];
  },

  // webassembly support for @dqbd/tiktoken
  webpack(config) {
    config.experiments = {
      asyncWebAssembly: true,
      layers: true,
    };

    return config;
  },
  sentry: {
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
    tunnelRoute: "/api/monitoring-tunnel",
  },
};

const sentryWebpackPluginOptions = {
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
};

export default withSentryConfig(nextConfig, sentryWebpackPluginOptions);
