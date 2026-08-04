import baseConfig from "@repo/eslint-config";

export default [
  ...baseConfig,

  // Raw Tailwind palette colors (bg-blue-500, text-red-600, text-white, …)
  // are banned moving forward — colors come from role tokens. ee/src is clean
  // as of the 2026-08-04 baseline, so no allowFiles entries here; never add
  // any.
  {
    name: "langfuse/ee/no-raw-colors",
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "@repo/no-raw-colors": "error",
    },
  },
];
