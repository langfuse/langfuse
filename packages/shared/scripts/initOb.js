#!/usr/bin/env node

const mysql = require("mysql2/promise");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// Configuration from environment variables (with fallback to defaults)
// eslint-disable-next-line turbo/no-undeclared-env-vars
const OB_ADMIN_USER = process.env.OB_ADMIN_USER || "root@oceanbase";
// eslint-disable-next-line turbo/no-undeclared-env-vars
const OB_ADMIN_PASSWORD = process.env.OB_ADMIN_PASSWORD || "";
// eslint-disable-next-line turbo/no-undeclared-env-vars
const OB_HOST = process.env.OB_HOST || "oceanbase";
// eslint-disable-next-line turbo/no-undeclared-env-vars
const OB_PORT = parseInt(process.env.OB_PORT || "2881", 10);
// eslint-disable-next-line turbo/no-undeclared-env-vars
const OB_DATABASE = process.env.OB_DATABASE || "langfuse";
// eslint-disable-next-line turbo/no-undeclared-env-vars
const OB_OPEN_CURSORS = process.env.OB_OPEN_CURSORS || "4000";
// eslint-disable-next-line turbo/no-undeclared-env-vars
const OB_MAX_ALLOWED_PACKET = process.env.OB_MAX_ALLOWED_PACKET || "4194304";

const MAX_WAIT_TIME = 300000; // 5 minutes in milliseconds
const WAIT_INTERVAL = 5000; // 5 seconds
const MAX_RETRIES = 5;
const RETRY_DELAY = 3000; // 3 seconds

/**
 * Create a MySQL connection for admin operations
 */
function createAdminConnection() {
  return mysql.createConnection({
    host: OB_HOST,
    port: OB_PORT,
    user: OB_ADMIN_USER,
    password: OB_ADMIN_PASSWORD,
    multipleStatements: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
  });
}

/**
 * Wait for OceanBase to be ready
 */
async function waitForOceanBase() {
  console.log("");
  console.log("Waiting for OceanBase to be ready...");
  const startTime = Date.now();

  while (Date.now() - startTime < MAX_WAIT_TIME) {
    try {
      const connection = await createAdminConnection();
      await connection.query("SELECT 1");
      await connection.end();
      console.log("OceanBase is ready!");
      return true;
    } catch (error) {
      const errorMessage = error.message || String(error);
      const elapsed = Math.floor((Date.now() - startTime) / 1000);

      if (errorMessage.toLowerCase().includes("server is initializing")) {
        console.log(
          `OceanBase is still initializing... (${elapsed}s/${MAX_WAIT_TIME / 1000}s)`,
        );
      } else {
        console.log(
          `Waiting for OceanBase... (${elapsed}s/${MAX_WAIT_TIME / 1000}s)`,
        );
      }

      if (Date.now() - startTime + WAIT_INTERVAL >= MAX_WAIT_TIME) {
        console.error(
          `Error: OceanBase did not become ready within ${MAX_WAIT_TIME / 1000} seconds (timeout)`,
        );
        console.error(`Last error: ${errorMessage}`);
        process.exit(1);
      }

      await new Promise((resolve) => setTimeout(resolve, WAIT_INTERVAL));
    }
  }

  console.error(
    `Error: OceanBase did not become ready within ${MAX_WAIT_TIME / 1000} seconds (timeout)`,
  );
  process.exit(1);
}

/**
 * Execute SQL with retry mechanism
 */
async function executeSqlWithRetry(connection, sql, description, params = []) {
  let retryCount = 0;

  while (retryCount < MAX_RETRIES) {
    try {
      await connection.query(sql, params);
      return;
    } catch (error) {
      const errorMessage = error.message || String(error);
      const isTransient =
        errorMessage.toLowerCase().includes("server is initializing") ||
        errorMessage.toLowerCase().includes("connection refused") ||
        errorMessage.toLowerCase().includes("timeout") ||
        errorMessage.toLowerCase().includes("temporarily unavailable") ||
        errorMessage.toLowerCase().includes("can't connect");

      if (isTransient && retryCount < MAX_RETRIES - 1) {
        retryCount++;
        console.log(
          `Warning: ${description} failed (attempt ${retryCount}/${MAX_RETRIES}), retrying in ${RETRY_DELAY / 1000}s...`,
        );
        console.log(`Error: ${errorMessage}`);
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
        continue;
      } else {
        console.error(`Error: ${description} failed`);
        console.error(errorMessage);
        throw error;
      }
    }
  }
}

/**
 * Check if database exists
 */
async function checkDatabaseExists(connection) {
  try {
    const [rows] = await connection.query(
      `SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?`,
      [OB_DATABASE],
    );
    return Array.isArray(rows) && rows.length > 0;
  } catch (error) {
    console.warn("Failed to check database existence, will attempt to create");
    return false;
  }
}

/**
 * Initialize database (create database, set cursor limit)
 */
async function initializeDatabase() {
  console.log("Initializing OceanBase database...");

  const connection = await createAdminConnection();

  try {
    // Create database
    console.log(`Creating database: ${OB_DATABASE}`);
    await executeSqlWithRetry(
      connection,
      `CREATE DATABASE IF NOT EXISTS \`${OB_DATABASE}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      "Create database",
    );
    console.log(`Database '${OB_DATABASE}' created successfully.`);

    // Set cursor limit
    console.log(`Setting open_cursors limit to ${OB_OPEN_CURSORS}...`);
    try {
      await connection.query(
        `ALTER SYSTEM SET open_cursors = ${OB_OPEN_CURSORS}`,
      );
      console.log(`Cursor limit set to ${OB_OPEN_CURSORS} successfully.`);
    } catch (error) {
      console.warn("Warning: Failed to set cursor limit, but continuing...");
    }

    // Set max_allowed_packet
    const maxAllowedPacketMB = Math.floor(
      parseInt(OB_MAX_ALLOWED_PACKET, 10) / 1024 / 1024,
    );
    console.log(
      `Setting max_allowed_packet to ${OB_MAX_ALLOWED_PACKET} (${maxAllowedPacketMB}MB)...`,
    );
    try {
      await connection.query(
        `SET GLOBAL max_allowed_packet = ${OB_MAX_ALLOWED_PACKET}`,
      );
      console.log(
        `max_allowed_packet set to ${OB_MAX_ALLOWED_PACKET} successfully.`,
      );
    } catch (error) {
      const errorMessage = error.message || String(error);
      console.warn(
        `Warning: Failed to set max_allowed_packet: ${errorMessage}, but continuing...`,
      );
    }
  } finally {
    await connection.end();
  }

  console.log("");
  console.log("Database initialization completed successfully.");
  console.log(`Database: ${OB_DATABASE}`);
  console.log(`Open cursors limit: ${OB_OPEN_CURSORS}`);
}

/**
 * Run Prisma migrations
 */
async function runPrismaMigrations() {
  console.log("");
  console.log("Running Prisma migrations for OceanBase...");

  // Get the project root directory (assuming script is in packages/shared/scripts/)
  const scriptDir = __dirname;
  const projectRoot = path.resolve(scriptDir, "../..");

  const schemaPath = path.join(
    projectRoot,
    "packages/shared/prisma/oceanbase/schema.prisma",
  );

  if (!fs.existsSync(schemaPath)) {
    // Try alternative: go up from current directory
    const altProjectRoot = process.cwd();
    const altSchemaPath = path.join(
      altProjectRoot,
      "packages/shared/prisma/oceanbase/schema.prisma",
    );
    if (fs.existsSync(altSchemaPath)) {
      // Use current directory as project root
      process.chdir(altProjectRoot);
    } else {
      console.error(
        `Error: Prisma schema not found at ${schemaPath} or ${altSchemaPath}`,
      );
      console.error(
        "Please run this script from the project root or ensure the schema file exists.",
      );
      process.exit(1);
    }
  } else {
    process.chdir(projectRoot);
  }

  // Set OCEANBASE_URL environment variable for Prisma
  // Use admin user for Prisma migrations
  const encodedUser = encodeURIComponent(OB_ADMIN_USER);
  const encodedPassword = encodeURIComponent(OB_ADMIN_PASSWORD || "");
  const oceanbaseUrl = `mysql://${encodedUser}:${encodedPassword}@${OB_HOST}:${OB_PORT}/${OB_DATABASE}`;
  // eslint-disable-next-line turbo/no-undeclared-env-vars
  process.env.OCEANBASE_URL = oceanbaseUrl;

  // Set npm cache directory
  // eslint-disable-next-line turbo/no-undeclared-env-vars
  process.env.NPM_CONFIG_CACHE = "/tmp/.npm";
  // eslint-disable-next-line turbo/no-undeclared-env-vars
  process.env.NPM_CONFIG_PREFIX = "/tmp/.npm-global";

  console.log(
    `Running: npx prisma migrate deploy --schema=./packages/shared/prisma/oceanbase/schema.prisma`,
  );

  // Run migration with retry
  let retryCount = 0;
  let exitCode = 1;

  while (retryCount < MAX_RETRIES && exitCode !== 0) {
    try {
      execSync(
        `npx prisma migrate deploy --schema=./packages/shared/prisma/oceanbase/schema.prisma`,
        {
          cwd: process.cwd(),
          stdio: "inherit",
          env: process.env,
        },
      );
      exitCode = 0;
      break;
    } catch (error) {
      exitCode = error.status || 1;
      retryCount++;
      if (retryCount < MAX_RETRIES) {
        console.log(
          `Warning: Prisma migration failed (attempt ${retryCount}/${MAX_RETRIES}), retrying in ${RETRY_DELAY / 1000}s...`,
        );
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
      }
    }
  }

  if (exitCode !== 0) {
    console.error(
      `Error: Prisma migration failed after ${MAX_RETRIES} attempts`,
    );
    process.exit(exitCode);
  }

  console.log("");
  console.log("Prisma migrations completed successfully.");
}

/**
 * Run ob:down and ob:up scripts
 */
async function runObMigrations() {
  console.log("");
  console.log("Running ob:down and ob:up scripts...");

  const scriptDir = __dirname;
  const sharedDir = path.resolve(scriptDir, "..");
  const initScript = path.join(sharedDir, "oceanbase/scripts/init.js");

  if (!fs.existsSync(initScript)) {
    console.error(`Error: init.js not found at ${initScript}`);
    process.exit(1);
  }

  // Prepare environment variables for init.js
  const initEnv = {
    ...process.env,
    OB_HOST: OB_HOST,
  };

  // Execute ob:down with retry
  console.log("");
  console.log("Executing ob:down (dropping existing tables)...");
  console.log(`Using OB_HOST: ${OB_HOST}, OB_PORT: ${OB_PORT}`);
  let retryCount = 0;
  let exitCode = 1;

  while (retryCount < MAX_RETRIES && exitCode !== 0) {
    try {
      execSync(`node "${initScript}" down`, {
        cwd: sharedDir,
        stdio: "inherit",
        env: initEnv,
      });
      exitCode = 0;
      break;
    } catch (error) {
      exitCode = error.status || 1;
      retryCount++;
      if (retryCount < MAX_RETRIES) {
        console.log(
          `Warning: ob:down failed (attempt ${retryCount}/${MAX_RETRIES}), retrying in ${RETRY_DELAY / 1000}s...`,
        );
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
      }
    }
  }

  if (exitCode !== 0) {
    console.warn(
      `Warning: ob:down failed after ${MAX_RETRIES} attempts with exit code ${exitCode}, but continuing...`,
    );
    // Don't exit, as down may fail if tables don't exist (which is fine)
  }

  // Execute ob:up with retry
  console.log("");
  console.log("Executing ob:up (creating tables from migration file)...");
  console.log(`Using OB_HOST: ${OB_HOST}, OB_PORT: ${OB_PORT}`);
  retryCount = 0;
  exitCode = 1;

  while (retryCount < MAX_RETRIES && exitCode !== 0) {
    try {
      execSync(`node "${initScript}" up`, {
        cwd: sharedDir,
        stdio: "inherit",
        env: initEnv,
      });
      exitCode = 0;
      break;
    } catch (error) {
      exitCode = error.status || 1;
      retryCount++;
      if (retryCount < MAX_RETRIES) {
        console.log(
          `Warning: ob:up failed (attempt ${retryCount}/${MAX_RETRIES}), retrying in ${RETRY_DELAY / 1000}s...`,
        );
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
      }
    }
  }

  if (exitCode !== 0) {
    console.error(`Error: ob:up failed after ${MAX_RETRIES} attempts`);
    process.exit(exitCode);
  }

  console.log("");
  console.log("ob:down and ob:up completed successfully.");
}

/**
 * Main function
 */
async function main() {
  console.log("Using Node.js mysql2 to connect to OceanBase...");
  console.log(`Host: ${OB_HOST}`);
  console.log(`Port: ${OB_PORT}`);
  console.log(`Admin User: ${OB_ADMIN_USER}`);
  console.log(`Database to check/create: ${OB_DATABASE}`);

  // Wait for OceanBase
  await waitForOceanBase();

  console.log("");

  // Check if database exists
  console.log(`Checking if database '${OB_DATABASE}' exists...`);
  const connection = await createAdminConnection();
  let needInit = false;

  try {
    const exists = await checkDatabaseExists(connection);
    if (exists) {
      console.log(
        `Database '${OB_DATABASE}' already exists. Skipping initialization...`,
      );
    } else {
      console.log(
        `Database '${OB_DATABASE}' does not exist. Starting initialization...`,
      );
      needInit = true;
    }
  } finally {
    await connection.end();
  }

  // Initialize if needed
  if (needInit) {
    await initializeDatabase();

    // Run Prisma migrations
    await runPrismaMigrations();

    // Run ob:down and ob:up
    await runObMigrations();
  } else {
    console.log(
      `Database '${OB_DATABASE}' already exists. Skipping migrations...`,
    );
  }

  console.log("");
  console.log("OceanBase initialization and migration completed successfully!");
}

// Run main function
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
