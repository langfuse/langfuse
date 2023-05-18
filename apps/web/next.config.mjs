// @ts-check
/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation.
 * This is especially useful for Docker builds and Linting.
 */
!process.env.SKIP_ENV_VALIDATION && (await import("./src/env.mjs"));

/** @type {import("next").NextConfig} */
const config = {
  reactStrictMode: true,
  /** Enables hot reloading for local packages without a build step */
  transpilePackages: ["@langfuse/api", "@langfuse/auth", "@langfuse/db"],

  /** If we want to disable eslint and typescript during next deployment  */
  // eslint: { ignoreDuringBuilds: !!process.env.CI },
  // typescript: { ignoreBuildErrors: !!process.env.CI },

  redirects: async () => ([
    {
      source: "/topic",
      destination: "/",
      permanent: false,
    }
  ]),

  images: {
    remotePatterns: process.env.NEXT_PUBLIC_SUPABASE_STATIC_BUCKET_URL ? [
      {
        protocol: 'https',
        hostname: new URL(process.env.NEXT_PUBLIC_SUPABASE_STATIC_BUCKET_URL || "").hostname,
        port: '',
        pathname: new URL(process.env.NEXT_PUBLIC_SUPABASE_STATIC_BUCKET_URL || "").pathname + '**',
      }
    ] : [],
  },

  experimental: {
    scrollRestoration: true,
  }
};

export default config;
