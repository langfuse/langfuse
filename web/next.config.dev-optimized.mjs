/**
 * Development-optimized Next.js configuration
 */
await import("./src/env.mjs");
import { withSentryConfig } from "@sentry/nextjs";
import { env } from "./src/env.mjs";

/** @type {import("next").NextConfig} */
const nextConfig = {
  staticPageGenerationTimeout: 500,
  transpilePackages: ["@langfuse/shared", "vis-network/standalone"],
  reactStrictMode: false, // Disable for dev performance
  experimental: {
    instrumentationHook: false, // Disable instrumentation in dev
    serverComponentsExternalPackages: [
      "dd-trace",
      "@opentelemetry/api",
      "@appsignal/opentelemetry-instrumentation-bullmq",
      "bullmq",
      "@opentelemetry/sdk-node",
      "@opentelemetry/instrumentation-winston",
      "kysely",
    ],
    // Enable faster refresh
    swcMinify: true,
    // Optimize for development
    optimizePackageImports: ['@radix-ui/react-icons', 'lucide-react'],
  },
  poweredByHeader: false,
  basePath: env.NEXT_PUBLIC_BASE_PATH,

  i18n: {
    locales: ["en"],
    defaultLocale: "en",
  },
  output: "standalone",

  // Minimal headers for dev
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
        ],
      },
    ];
  },

  // Optimized webpack config for dev
  webpack(config, { dev, isServer }) {
    if (dev) {
      // Optimize for development
      config.optimization = {
        ...config.optimization,
        removeAvailableModules: false,
        removeEmptyChunks: false,
        splitChunks: false,
      };
      
      // Faster source maps for development
      config.devtool = 'eval-cheap-module-source-map';
      
      // Skip expensive plugins in dev
      config.plugins = config.plugins.filter((plugin) => {
        return !plugin.constructor?.name?.includes('OptimizeCssAssetsWebpackPlugin');
      });
    }

    config.experiments = {
      asyncWebAssembly: true,
      layers: true,
    };

    // Exclude heavy packages from webpack bundling
    config.externals.push("@datadog/pprof", "dd-trace");
    
    // Skip source map generation for node_modules in dev
    if (dev) {
      config.module.rules.push({
        test: /node_modules/,
        use: {
          loader: 'source-map-loader',
        },
        enforce: 'pre',
        exclude: [
          /node_modules\/@sentry/,
          /node_modules\/@opentelemetry/,
          /node_modules\/prisma/,
        ]
      });
    }

    return config;
  },
};

// Skip Sentry in development for faster builds
export default process.env.NODE_ENV === 'development' 
  ? nextConfig 
  : withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: env.SENTRY_AUTH_TOKEN,
      silent: !process.env.CI,
      widenClientFileUpload: true,
      reactComponentAnnotation: { enabled: true },
      hideSourceMaps: true,
      disableLogger: true,
      automaticVercelMonitors: false,
    });