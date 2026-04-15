// jest.config.mjs
// Uses @swc/jest for TypeScript transpilation instead of next/jest.

const swcConfig = {
  jsc: {
    parser: {
      syntax: "typescript",
      tsx: true,
      decorators: true,
    },
    transform: {
      react: {
        runtime: "automatic",
      },
    },
  },
  module: {
    type: "commonjs",
  },
  // Avoid noisy "failed to read input source map" warnings from node_modules
  // packages that reference missing .map files.
  sourceMaps: false,
};

const swcTransform = ["@swc/jest", swcConfig];

// Shared moduleNameMapper replicating what next/jest provided.
const moduleNameMapper = {
  // CSS modules → proxy that returns class names as strings
  "^.+\\.module\\.(css|sass|scss)$":
    "<rootDir>/src/__mocks__/cssModuleProxy.js",
  // Plain CSS/SASS/SCSS → empty object
  "^.+\\.(css|sass|scss)$": "<rootDir>/src/__mocks__/styleMock.js",
  // Image imports
  "^.+\\.(png|jpg|jpeg|gif|webp|avif|ico|bmp)$":
    "<rootDir>/src/__mocks__/fileMock.js",
  "^.+\\.(svg)$": "<rootDir>/src/__mocks__/fileMock.js",
  // next/font mocks
  "@next/font/(.*)": "<rootDir>/src/__mocks__/nextFontMock.js",
  "next/font/(.*)": "<rootDir>/src/__mocks__/nextFontMock.js",
  // Disable server-only
  "^server-only$": "<rootDir>/src/__mocks__/empty.js",
  // tsconfig path alias: @/* → <rootDir>/*
  "^@/(.*)$": "<rootDir>/$1",
};

const sharedProject = {
  transform: {
    "^.+\\.(t|j)sx?$": swcTransform,
    "^.+\\.mjs$": swcTransform,
  },
  // Transform all node_modules through SWC to handle ESM-only packages.
  // SWC is fast enough that this is acceptable.
  transformIgnorePatterns: [],
  moduleNameMapper,
  testPathIgnorePatterns: ["/node_modules/", "/.next/"],
  watchPathIgnorePatterns: ["/.next/"],
};

const clientTestConfig = {
  ...sharedProject,
  displayName: "client",
  testMatch: ["/**/*.clienttest.[jt]s?(x)"],
  testEnvironment: "jest-environment-jsdom",
  testEnvironmentOptions: { globalsCleanup: "on" },
};

const serverTestConfig = {
  ...sharedProject,
  displayName: "server",
  testPathIgnorePatterns: [...sharedProject.testPathIgnorePatterns, "__e2e__"],
  testMatch: ["/**/server/**/*.servertest.[jt]s?(x)"],
  testEnvironment: "jest-environment-node",
  testEnvironmentOptions: { globalsCleanup: "on" },
  setupFilesAfterEnv: ["<rootDir>/src/__tests__/after-teardown.ts"],
  globalTeardown: "<rootDir>/src/__tests__/teardown.ts",
};

const endToEndServerTestConfig = {
  ...sharedProject,
  displayName: "e2e-server",
  testMatch: ["/**/*.servertest.[jt]s?(x)"],
  testPathIgnorePatterns: [
    ...sharedProject.testPathIgnorePatterns,
    "__tests__",
  ],
  testEnvironment: "jest-environment-node",
  testEnvironmentOptions: { globalsCleanup: "on" },
  setupFilesAfterEnv: ["<rootDir>/src/__tests__/after-teardown.ts"],
  globalTeardown: "<rootDir>/src/__tests__/teardown.ts",
};

/** @type {import('jest').Config} */
const config = {
  // Ignore .next/standalone to avoid "Haste module naming collision" warning
  modulePathIgnorePatterns: ["<rootDir>/.next/"],
  // Jest 30 performance: recycle workers when memory exceeds limit
  workerIdleMemoryLimit: "512MB",
  projects: [clientTestConfig, serverTestConfig, endToEndServerTestConfig],
};

export default config;
