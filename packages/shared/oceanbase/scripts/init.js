#!/usr/bin/env node

const mysql = require("mysql2/promise");
const fs = require("fs");
const path = require("path");

// Configuration from environment variables (with fallback to defaults)
// eslint-disable-next-line turbo/no-undeclared-env-vars
const OB_ADMIN_USER = process.env.OB_ADMIN_USER || "root@oceanbase";
// eslint-disable-next-line turbo/no-undeclared-env-vars
const OB_ADMIN_PASSWORD = process.env.OB_ADMIN_PASSWORD || "";
// eslint-disable-next-line turbo/no-undeclared-env-vars
const OB_HOST = process.env.OB_HOST || "127.0.0.1";
// eslint-disable-next-line turbo/no-undeclared-env-vars
const OB_PORT = process.env.OB_PORT || "2881";
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
 * Parse connection details from environment variables
 * Support both direct env vars and DATABASE_URL format
 */
function parseConnectionConfig() {
  return {
    user: OB_ADMIN_USER,
    password: OB_ADMIN_PASSWORD,
    host: OB_HOST,
    port: OB_PORT,
    database: OB_DATABASE,
  };
}

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
 * Create a MySQL connection for database operations
 */
function createDatabaseConnection(config) {
  return mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
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
 * Initialize database (create database, user, grant privileges, set cursor limit)
 */
async function initializeDatabase() {
  console.log("Using Node.js mysql2 to connect to OceanBase...");
  console.log(`Host: ${OB_HOST}`);
  console.log(`Port: ${OB_PORT}`);
  console.log(`Admin User: ${OB_ADMIN_USER}`);
  console.log(`Database to create: ${OB_DATABASE}`);

  // Wait for OceanBase
  await waitForOceanBase();

  console.log("");

  // Create database
  console.log(`Creating database: ${OB_DATABASE}`);
  const connection = await createAdminConnection();

  try {
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
 * Drop tables (down operation)
 */
async function dropTables() {
  const config = parseConnectionConfig();

  console.log("Using Node.js mysql2 to connect to OceanBase...");
  console.log(`Host: ${config.host}`);
  console.log(`Port: ${config.port}`);
  console.log(`Database: ${config.database}`);
  console.log(`User: ${config.user}`);
  console.log(`Password: ${config.password}`);

  // Read migration file
  const scriptDir = __dirname;
  const migrationFile = path.join(scriptDir, "../migrations/migrate.ob.sql");

  if (!fs.existsSync(migrationFile)) {
    console.error(`Error: Migration file not found: ${migrationFile}`);
    process.exit(1);
  }

  console.log("Extracting DROP TABLE statements from migration file...");

  const migrationContent = fs.readFileSync(migrationFile, "utf-8");
  const dropStatements = migrationContent
    .split("\n")
    .filter((line) =>
      line.trim().toUpperCase().startsWith("DROP TABLE IF EXISTS"),
    )
    .reverse(); // Reverse to drop dependent tables first

  if (dropStatements.length === 0) {
    console.log("Warning: No DROP TABLE statements found in migration file.");
    process.exit(0);
  }

  // Create connection
  const connection = await createDatabaseConnection(config);

  try {
    // Execute DROP statements
    for (const statement of dropStatements) {
      if (statement.trim()) {
        console.log(`Executing: ${statement.trim()}`);
        try {
          await connection.query(statement.trim());
        } catch (error) {
          // Ignore errors if table doesn't exist
          const errorMessage = error.message || String(error);
          if (
            !errorMessage.toLowerCase().includes("doesn't exist") &&
            !errorMessage.toLowerCase().includes("unknown table")
          ) {
            console.warn(`Warning: ${errorMessage}`);
          }
        }
      }
    }

    console.log("Tables dropped successfully.");
  } finally {
    await connection.end();
  }
}

/**
 * Create tables (up operation)
 */
async function createTables() {
  const config = parseConnectionConfig();

  console.log("Using Node.js mysql2 to connect to OceanBase...");
  console.log(`Host: ${config.host}`);
  console.log(`Port: ${config.port}`);
  console.log(`Database: ${config.database}`);
  console.log(`User: ${config.user}`);

  // Read migration file
  const scriptDir = __dirname;
  const migrationFile = path.join(scriptDir, "../migrations/migrate.ob.sql");

  if (!fs.existsSync(migrationFile)) {
    console.error(`Error: Migration file not found: ${migrationFile}`);
    process.exit(1);
  }

  console.log(`Executing migration file: ${migrationFile}`);

  const migrationContent = fs.readFileSync(migrationFile, "utf-8");

  // Create connection
  const connection = await createDatabaseConnection(config);

  try {
    await connection.query(migrationContent);
    console.log("Migration completed successfully.");
  } catch (error) {
    console.error(`Error: Migration failed: ${error.message}`);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

/**
 * Drop and recreate tables (drop operation)
 */
async function dropAndRecreateTables() {
  const config = parseConnectionConfig();

  console.log("Using Node.js mysql2 to connect to OceanBase...");
  console.log(`Host: ${config.host}`);
  console.log(`Port: ${config.port}`);
  console.log(`Database: ${config.database}`);
  console.log(`User: ${config.user}`);

  // Read migration file
  const scriptDir = __dirname;
  const migrationFile = path.join(scriptDir, "../migrations/migrate.ob.sql");

  if (!fs.existsSync(migrationFile)) {
    console.error(`Error: Migration file not found: ${migrationFile}`);
    process.exit(1);
  }

  console.log("Extracting table names from migration file...");

  const migrationContent = fs.readFileSync(migrationFile, "utf-8");

  // Extract table names from CREATE TABLE statements
  const tableNames = [];
  const createTableRegex =
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`([^`]+)`/gi;
  let match;
  while ((match = createTableRegex.exec(migrationContent)) !== null) {
    tableNames.push(match[1]);
  }

  // Reverse to drop dependent tables first
  tableNames.reverse();

  if (tableNames.length === 0) {
    console.log("Warning: No CREATE TABLE statements found in migration file.");
    process.exit(0);
  }

  // Create connection
  const connection = await createDatabaseConnection(config);

  try {
    // Drop all tables
    console.log("Dropping all tables...");
    for (const table of tableNames) {
      if (table) {
        console.log(`Dropping table: ${table}`);
        try {
          await connection.query(`DROP TABLE IF EXISTS \`${table}\``);
        } catch (error) {
          // Ignore errors if table doesn't exist
          const errorMessage = error.message || String(error);
          if (
            !errorMessage.toLowerCase().includes("doesn't exist") &&
            !errorMessage.toLowerCase().includes("unknown table")
          ) {
            console.warn(`Warning: ${errorMessage}`);
          }
        }
      }
    }

    console.log("All tables dropped successfully.");

    // Create tables by executing the migration file
    console.log("");
    console.log(`Creating tables from migration file: ${migrationFile}`);

    await connection.query(migrationContent);
    console.log("All tables created successfully.");
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

/**
 * Main function
 */
async function main() {
  const command = process.argv[2]; // 'init', 'down', 'up', or 'drop'

  try {
    switch (command) {
      case "down":
        await dropTables();
        break;
      case "up":
        await createTables();
        break;
      case "drop":
        await dropAndRecreateTables();
        break;
      case "init":
      case undefined:
        // Default to init if no command specified
        await initializeDatabase();
        break;
      default:
        console.error(`Unknown command: ${command}`);
        console.error("Usage: node init.js [init|down|up|drop]");
        process.exit(1);
    }
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
}

// Run main function
main();
