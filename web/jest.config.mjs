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
};

const serverTestConfig = {
  displayName: "server",
  testMatch: ["/**/*.servertest.[jt]s?(x)"],
  testEnvironment: "jest-environment-node",
  setupFilesAfterEnv: ["<rootDir>/src/__tests__/after-teardown.ts"],
  globalTeardown: "<rootDir>/src/__tests__/teardown.ts",
};

// To avoid the "Cannot use import statement outside a module" errors while transforming ESM.
const esModules = ["superjson"];
// Add any custom config to be passed to Jest
/** @type {import('jest').Config} */
const config = {
  // Add more setup options before each test is run
  silent: false,
  verbose: true,
  projects: [
    await createJestConfig(clientTestConfig)(),
    {
      ...(await createJestConfig(serverTestConfig)()),
      transformIgnorePatterns: [
        `/web/node_modules/(?!(${esModules.join("|")})/)`,
      ],
    },
  ],
};

process.env = Object.assign(process.env, {
  LANGFUSE_CACHE_API_KEY_ENABLED: "true",
});

export default config;
