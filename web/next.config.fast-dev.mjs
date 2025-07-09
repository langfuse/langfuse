/**
 * Fast Development Configuration for Langfuse
 * 
 * This configuration optimizes the dev server for faster startup and hot reload.
 * Use this by copying it over next.config.mjs during development.
 * 
 * Performance improvements:
 * - Disables Sentry in development (major startup improvement)
 * - Optimizes webpack for development builds
 * - Reduces security headers overhead
 * - Skips expensive optimizations
 */
await import("./src/env.mjs");
import { env } from "./src/env.mjs";

/** @type {import("next").NextConfig} */
const nextConfig = {
  staticPageGenerationTimeout: 500,
  transpilePackages: ["@langfuse/shared", "vis-network/standalone"],
  
  // Disable strict mode for faster development
  reactStrictMode: false,
  
  experimental: {
    // Disable instrumentation in development for faster startup
    instrumentationHook: false,
    serverComponentsExternalPackages: [
      "dd-trace",
      "@opentelemetry/api",
      "@appsignal/opentelemetry-instrumentation-bullmq",
      "bullmq",
      "@opentelemetry/sdk-node",
      "@opentelemetry/instrumentation-winston",
      "kysely",
    ],
    // Optimize package imports for faster builds
    optimizePackageImports: [
      '@radix-ui/react-icons', 
      'lucide-react',
      '@tremor/react',
      'recharts'
    ],
  },
  
  poweredByHeader: false,
  basePath: env.NEXT_PUBLIC_BASE_PATH,

  i18n: {
    locales: ["en"],
    defaultLocale: "en",
  },
  output: "standalone",

  // Minimal headers for development
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

  // Optimized webpack configuration for development
  webpack(config, { dev, isServer }) {
    if (dev) {
      // Optimize for development speed
      config.optimization = {
        ...config.optimization,
        removeAvailableModules: false,
        removeEmptyChunks: false,
        splitChunks: false,
        minimize: false,
      };
      
      // Use faster source maps
      config.devtool = 'eval-cheap-module-source-map';
      
      // Reduce build time by skipping expensive plugins
      config.plugins = config.plugins.filter((plugin) => {
        const pluginName = plugin.constructor?.name;
        return !pluginName?.includes('OptimizeCss') && 
               !pluginName?.includes('TerserPlugin') &&
               !pluginName?.includes('CompressionPlugin');
      });
      
      // Faster module resolution
      config.resolve.symlinks = false;
      config.resolve.cacheWithContext = false;
      
      // Skip source map generation for heavy node_modules
      config.module.rules.push({
        test: /\.js$/,
        include: /node_modules/,
        use: {
          loader: 'source-map-loader',
        },
        enforce: 'pre',
        exclude: [
          /node_modules\/@sentry/,
          /node_modules\/@opentelemetry/,
          /node_modules\/prisma/,
          /node_modules\/dd-trace/,
          /node_modules\/bullmq/,
        ]
      });
    }

    // WebAssembly support
    config.experiments = {
      asyncWebAssembly: true,
      layers: true,
    };

    // Exclude heavy packages from webpack bundling
    config.externals.push("@datadog/pprof", "dd-trace");

    return config;
  },
};

// Skip Sentry completely in development for faster builds
export default nextConfig;