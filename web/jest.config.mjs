// jest.config.mjs
import nextJest from "next/jest.js";

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: "./",
});

const clientTestConfig = {
  displayName: "client",
  testMatch: ["/**/*.clienttest.[jt]s?(x)"],
  testEnvironment: "jest-environment-jsdom",
  testEnvironmentOptions: { globalsCleanup: "on" },
};

const serverTestConfig = {
  displayName: "server",
  testPathIgnorePatterns: ["__e2e__"],
  testMatch: ["/**/server/**/*.servertest.[jt]s?(x)"],
  testEnvironment: "jest-environment-node",
  testEnvironmentOptions: { globalsCleanup: "on" },
  setupFilesAfterEnv: ["<rootDir>/src/__tests__/after-teardown.ts"],
  globalTeardown: "<rootDir>/src/__tests__/teardown.ts",
};

const endToEndServerTestConfig = {
  displayName: "e2e-server",
  testMatch: ["/**/*.servertest.[jt]s?(x)"],
  testPathIgnorePatterns: ["__tests__"],
  testEnvironment: "jest-environment-node",
  testEnvironmentOptions: { globalsCleanup: "on" },
  setupFilesAfterEnv: ["<rootDir>/src/__tests__/after-teardown.ts"],
  globalTeardown: "<rootDir>/src/__tests__/teardown.ts",
};

// To avoid the "Cannot use import statement outside a module" errors while transforming ESM.
// jsonpath-plus is needed because @langfuse/shared barrel exports evals/utilities which imports it
const esModules = ["superjson", "jsonpath-plus", "json-schema-faker"];

// ESM-only packages need explicit resolution to bypass Jest's CJS exports-map resolver
const esmOnlyModuleNameMapper = {
  "^json-schema-faker$":
    "<rootDir>/node_modules/json-schema-faker/dist/index.js",
};

const transformIgnorePatterns = [
  `/web/node_modules/(?!(${esModules.join("|")})/)`,
];

// Helper to merge our ESM moduleNameMapper with Next.js's built-in mappings
const withEsmMapper = (/** @type {import('jest').Config} */ resolved) => ({
  ...resolved,
  transformIgnorePatterns,
  moduleNameMapper: {
    ...resolved.moduleNameMapper,
    ...esmOnlyModuleNameMapper,
  },
});

// Add any custom config to be passed to Jest
/** @type {import('jest').Config} */
const config = {
  // Ignore .next/standalone to avoid "Haste module naming collision" warning
  modulePathIgnorePatterns: ["<rootDir>/.next/"],
  // Jest 30 performance: recycle workers when memory exceeds limit
  workerIdleMemoryLimit: "512MB",
  // Add more setup options before each test is run
  projects: [
    // Added transformIgnorePatterns to handle ESM dependencies from @langfuse/shared
    // Without this, importing from @langfuse/shared fails with "Unexpected token 'export'" errors
    withEsmMapper(await createJestConfig(clientTestConfig)()),
    withEsmMapper(await createJestConfig(serverTestConfig)()),
    withEsmMapper(await createJestConfig(endToEndServerTestConfig)()),
  ],
};

export default config;
