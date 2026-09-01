/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
await import("./src/env.mjs");
import { withSentryConfig } from "@sentry/nextjs";
import { env } from "./src/env.mjs";
import { renamedRouteRedirects } from "./redirects.mjs";

/**
 * CSP headers
 * img-src https to allow loading images from SSO providers
 */
// Dataset attachments PUT media directly to presigned storage URLs, so
// connect-src must allow AWS S3, Azure Blob Storage, GCS, and the configured
// S3-compatible endpoint. The endpoint env var is only present at runtime in
// official Docker images, so static wildcards cover the common providers and
// the local Docker Compose MinIO endpoint too.
const mediaUploadConnectSrc = (() => {
  const endpoint = env.LANGFUSE_S3_MEDIA_UPLOAD_ENDPOINT;
  if (!endpoint) return "";
  try {
    const url = new URL(endpoint);
    const port = url.port ? `:${url.port}` : "";
    return `${url.origin} ${url.protocol}//*.${url.hostname}${port} `;
  } catch {
    return "";
  }
})();
const localStorageConnectSrc =
  env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === undefined
    ? "http://localhost:* "
    : "";
// When build output is served from a dedicated asset hostname, that origin has
// to be allowed everywhere Next.js can emit an asset URL. A host under
// langfuse.com would already be covered by the wildcards below, but the policy
// must not silently depend on where the asset host happens to live.
// Deliberately NOT added to img-src / media-src, which already allow `https:`,
// nor to worker-src: experimental.turbopackWorkerAssetPrefix keeps Worker
// entrypoints and their module chunks on the app origin, so 'self' blob:
// remains the right policy even when other /_next/static assets are cross-origin.
const assetPrefixSrc = env.NEXT_PUBLIC_ASSET_PREFIX
  ? `${new URL(env.NEXT_PUBLIC_ASSET_PREFIX).origin} `
  : "";
const cspHeader = `
  default-src 'self' ${assetPrefixSrc}https://*.langfuse.com https://*.langfuse.dev https://*.posthog.com https://*.sentry.io;
  script-src 'self' 'unsafe-eval' 'unsafe-inline' ${assetPrefixSrc}https://*.langfuse.com https://*.langfuse.dev https://challenges.cloudflare.com https://*.sentry.io  https://static.cloudflareinsights.com https://*.stripe.com https://login.microsoftonline.com https://login.microsoft.com https://*.microsoftonline.com;
  style-src 'self' 'unsafe-inline' ${assetPrefixSrc}https://fonts.googleapis.com https://login.microsoftonline.com https://login.microsoft.com https://*.microsoftonline.com;
  img-src 'self' https: blob: data: http://localhost:* https://prod-uk-services-workspac-workspacefilespublicbuck-vs4gjqpqjkh6.s3.amazonaws.com https://prod-uk-services-attachm-attachmentsbucket28b3ccf-uwfssb4vt2us.s3.eu-west-2.amazonaws.com https://i0.wp.com;
  font-src ${assetPrefixSrc}'self';
  frame-src 'self' https://challenges.cloudflare.com https://*.stripe.com https://login.microsoftonline.com https://login.microsoft.com https://*.microsoftonline.com;
  worker-src 'self' blob:;
  object-src 'none';
  base-uri 'self';
  form-action 'self' https://login.microsoftonline.com https://login.microsoft.com https://*.microsoftonline.com;
  frame-ancestors 'none';
  connect-src 'self' ${localStorageConnectSrc}${mediaUploadConnectSrc}${assetPrefixSrc}https://*.langfuse.com https://*.langfuse.dev https://*.ingest.us.sentry.io https://*.sentry.io https://chat.uk.plain.com https://*.amazonaws.com https://*.blob.core.windows.net https://storage.googleapis.com https://prod-uk-services-attachm-attachmentsuploadbucket2-1l2e4906o2asm.s3.eu-west-2.amazonaws.com https://login.microsoftonline.com https://login.microsoft.com https://*.microsoftonline.com https://graph.microsoft.com;
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
  // Emit and serve browser source maps in production. Langfuse is open source,
  // so there is nothing to hide by shipping maps, and browser devtools then
  // de-minify client stacks automatically. NOTE: this alone does NOT make Sentry
  // legible — the Sentry SDK rewrites frames to the `app:///` scheme, which is
  // not a fetchable URL, so Sentry cannot pull these public maps. Sentry
  // symbolication is handled separately by uploading maps with debug IDs (see
  // `sourcemaps` in withSentryConfig below).
  productionBrowserSourceMaps: true,
  // Allow building to alternate directory for parallel build checks while dev server runs
  distDir: process.env.NEXT_DIST_DIR || ".next",
  typescript: {
    // CI test jobs run `pnpm run typecheck` separately and skip duplicate
    // Next.js type checks to keep test builds fast. Production/Docker builds
    // do not set this flag and still fail on TypeScript errors.
    ignoreBuildErrors: process.env.NEXT_IGNORE_BUILD_ERRORS === "true",
  },
  // Agent/browser tooling often targets 127.0.0.1 instead of localhost in dev.
  allowedDevOrigins: ["127.0.0.1"],
  staticPageGenerationTimeout: 500, // default is 60. Required for build process for amd
  transpilePackages: ["@langfuse/shared"],
  reactStrictMode: true,
  serverExternalPackages: [
    "dd-trace",
    "@opentelemetry/api",
    "@appsignal/opentelemetry-instrumentation-bullmq",
    "bullmq",
    "@opentelemetry/sdk-node",
    "@opentelemetry/instrumentation-winston",
    "piscina",
  ],
  poweredByHeader: false,
  basePath: env.NEXT_PUBLIC_BASE_PATH,
  // Hand the browser a dedicated hostname for this build's `/_next/static/*`
  // output so a CDN in front of it can keep serving the chunks of a build that
  // has already been replaced — a tab that outlives a deploy otherwise 404s on
  // its own chunks. The app origin keeps serving the same files either way;
  // this only changes the URLs that get emitted, which is why unsetting the
  // variable and rebuilding is a complete rollback.
  //
  // Baked in at build time, not read at runtime: the bundler writes it into the
  // client runtime's public path, and the standalone server reads the config
  // frozen into .next/required-server-files.json rather than this file. The
  // deploy workflow already builds one image per environment, so this is set
  // per environment there.
  assetPrefix: env.NEXT_PUBLIC_ASSET_PREFIX,
  // Only meaningful alongside an asset prefix, and load-bearing there: without
  // `crossorigin`, an exception thrown by a cross-origin script reaches
  // window.onerror as a bare "Script error" with no stack, which would blind
  // Sentry to exactly the failures this setup exists to observe. Requires the
  // asset host to send Access-Control-Allow-Origin, so scripts fail closed
  // rather than silently losing their stacks.
  crossOrigin: env.NEXT_PUBLIC_ASSET_PREFIX ? "anonymous" : undefined,
  compiler: {
    define: {
      "import.meta.vitest": "undefined",
    },
  },
  turbopack: {
    resolveAlias: {
      "@langfuse/shared": "./packages/shared/src",
    },
    rules: {
      "*.md": {
        loaders: ["raw-loader"],
        as: "*.js",
      },
    },
  },
  logging: {
    browserToTerminal: true,
  },
  experimental: {
    // Use the Rust port instead of the Babel transform
    // turbopackRustReactCompiler: true,
    // Keep `new Worker(new URL(..., import.meta.url))` on the app origin when
    // assetPrefix points at a CDN. Browsers reject a cross-origin classic
    // worker (Turbopack always constructs one), and the worker bootstrap also
    // refuses foreign-origin module chunks, so both the entrypoint and its
    // imports have to stay same-origin. Empty string is a literal prefix, not
    // a fallback: it emits `/_next/...` on the page origin. Unset (undefined)
    // would inherit assetPrefix and break workers on Cloud.
    turbopackWorkerAssetPrefix: "",
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
  // Keep Scalar outside Next's client compilation by tracing its prebuilt bundle.
  // Its MIT notice must ship with redistributed copies.
  outputFileTracingIncludes: {
    "/api/docs": [
      "./node_modules/@scalar/api-reference/dist/browser/standalone.js",
      "./third-party-licenses/scalar-api-reference.LICENSE.txt",
    ],
  },

  async redirects() {
    return renamedRouteRedirects;
  },

  async rewrites() {
    return [
      {
        source: "/.well-known/mcp.json",
        destination: "/api/well-known/mcp.json",
      },
      {
        source: "/api/openapi.yaml",
        destination: "/generated/api/openapi.yml",
      },
    ];
  },

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
      {
        source: "/api/openapi.yaml",
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

  webpack(config, { isServer, webpack }) {
    // Exclude Datadog packages from webpack bundling to avoid issues
    // see: https://docs.datadoghq.com/tracing/trace_collection/automatic_instrumentation/dd_libraries/nodejs/#bundling-with-nextjs
    config.externals.push("@datadog/pprof", "dd-trace");

    config.module.rules.push({
      test: /\.md$/i,
      type: "asset/source",
    });

    // Setup in-source testing: https://vitest.dev/guide/in-source.html#other-bundlers
    config.plugins.push(
      new webpack.DefinePlugin({
        "import.meta.vitest": "undefined",
      }),
    );

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

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  // tunnelRoute: "/api/monitoring-tunnel",

  // Upload source maps to Sentry with debug IDs so Sentry can symbolicate
  // minified production stack traces. This restores upload that regressed in the
  // Sentry v8->v10 upgrade (#8934): it mistranslated the old `hideSourceMaps:
  // true` (upload, then hide from the public bundle) into `sourcemaps.disable`
  // (do not upload at all) — the correct v10 equivalent was
  // `deleteSourcemapsAfterUpload: true` — so Sentry stacks have been minified
  // since. Upload worked across all regions/orgs/projects under v8 via the same
  // per-region SENTRY_ORG/SENTRY_PROJECT/SENTRY_AUTH_TOKEN this reads. Debug IDs
  // match a map to an event by an embedded id, independent of URLs and the
  // `app:///` frame rewrite — which is why serving maps at a public
  // sourceMappingURL (#15277) can't symbolicate Sentry. Upload runs only when
  // SENTRY_AUTH_TOKEN is present (prod builds) and targets the per-region
  // org/project/release baked into each region's build. We also keep serving the
  // maps publicly (`productionBrowserSourceMaps` above, for devtools), so unlike
  // the old `hideSourceMaps` we do NOT delete them after upload.
  sourcemaps: {
    deleteSourcemapsAfterUpload: false,
  },

  // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
  // See the following for more information:
  // https://docs.sentry.io/product/crons/
  // https://vercel.com/docs/cron-jobs
  automaticVercelMonitors: false,

  webpack: {
    // Automatically annotate React components to show their full name in breadcrumbs and session replay.
    reactComponentAnnotation: {
      enabled: true,
    },

    // Automatically tree-shake Sentry logger statements to reduce bundle size.
    treeshake: {
      removeDebugLogging: true,
    },
  },
});

export default sentryConfig;
