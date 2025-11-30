#!/usr/bin/env tsx

/**
 * OTEL Ingestion Replay Script
 *
 * This script replays OTEL ingestion events from S3 for multiple projects.
 * It reads project IDs from a text file and makes concurrent requests to the
 * otel-ingestion-replay API endpoint.
 *
 * Usage:
 *   pnpm --filter=worker run otel-ingestion-replay \
 *     --projects-file ./projects.txt \
 *     --start-date 2025-01-01T00:00:00Z \
 *     --end-date 2025-01-02T00:00:00Z \
 *     --base-url https://cloud.langfuse.com \
 *     --admin-api-key your-admin-api-key
 *
 * Options:
 *   --projects-file    Path to text file with project IDs (one per line)
 *   --start-date       Start date in ISO-8601 format
 *   --end-date         End date in ISO-8601 format
 *   --base-url         Base URL of the Langfuse instance
 *   --admin-api-key    Admin API key for authentication
 *   --granularity      S3 prefix granularity: "hour" (default) or "minute"
 *   --concurrency      Max concurrent requests (default: 5)
 *   --output           Output JSON file path (default: otel-replay-results.json)
 *   --dry-run          Preview what would be processed without making requests
 */

import { Command } from "commander";
import * as fs from "fs";
import * as path from "path";
import pLimit from "p-limit";

// Types
interface ProjectResult {
  projectId: string;
  status: "success" | "error" | "skipped";
  jobsQueued?: number;
  filesFound?: number;
  durationMs: number;
  error?: string;
}

interface ReplayStats {
  totalProjects: number;
  successCount: number;
  errorCount: number;
  skippedCount: number;
  totalJobsQueued: number;
  totalDurationMs: number;
  results: ProjectResult[];
}

interface ApiResponse {
  jobsQueued?: number;
  filesFound?: number;
  error?: string;
  message?: string;
}

// Parse and validate command line arguments
function parseArgs() {
  const program = new Command();

  program
    .name("otel-ingestion-replay")
    .description("Replay OTEL ingestion events from S3 for multiple projects")
    .requiredOption(
      "-f, --projects-file <path>",
      "Path to text file with project IDs (one per line)",
    )
    .requiredOption(
      "-s, --start-date <date>",
      "Start date in ISO-8601 format (e.g., 2025-01-01T00:00:00Z)",
    )
    .requiredOption(
      "-e, --end-date <date>",
      "End date in ISO-8601 format (e.g., 2025-01-02T00:00:00Z)",
    )
    .requiredOption("-u, --base-url <url>", "Base URL of the Langfuse instance")
    .requiredOption(
      "-k, --admin-api-key <key>",
      "Admin API key for authentication",
    )
    .option(
      "-g, --granularity <level>",
      'S3 prefix granularity: "hour" or "minute"',
      "hour",
    )
    .option(
      "-c, --concurrency <number>",
      "Max concurrent requests",
      (val) => parseInt(val, 10),
      5,
    )
    .option(
      "-o, --output <path>",
      "Output JSON file path",
      "otel-replay-results.json",
    )
    .option(
      "-d, --dry-run",
      "Preview what would be processed without making requests",
      false,
    )
    .parse(process.argv);

  return program.opts();
}

// Validate ISO-8601 date string
function validateIsoDate(dateStr: string, fieldName: string): Date {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    throw new Error(
      `Invalid ${fieldName}: "${dateStr}". Must be a valid ISO-8601 date string.`,
    );
  }
  return date;
}

// Parse and validate projects file
function parseProjectsFile(filePath: string): string[] {
  const absolutePath = path.resolve(filePath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Projects file not found: ${absolutePath}`);
  }

  const content = fs.readFileSync(absolutePath, "utf-8");
  const lines = content.split("\n");

  const projectIds: string[] = [];
  const errors: string[] = [];

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) {
      return;
    }

    // Skip comment lines
    if (trimmed.startsWith("#")) {
      return;
    }

    // Validate project ID (non-empty string without whitespace)
    if (/\s/.test(trimmed)) {
      errors.push(
        `Line ${index + 1}: Project ID contains whitespace: "${line}"`,
      );
      return;
    }

    // Check for duplicates
    if (projectIds.includes(trimmed)) {
      console.warn(
        `⚠️  Warning: Duplicate project ID at line ${index + 1}: "${trimmed}" (skipping)`,
      );
      return;
    }

    projectIds.push(trimmed);
  });

  if (errors.length > 0) {
    throw new Error(
      `Invalid projects file:\n${errors.map((e) => `  - ${e}`).join("\n")}`,
    );
  }

  if (projectIds.length === 0) {
    throw new Error("Projects file is empty or contains no valid project IDs");
  }

  return projectIds;
}

// Make API request to replay endpoint
async function replayProject(
  projectId: string,
  options: {
    baseUrl: string;
    adminApiKey: string;
    startDate: string;
    endDate: string;
    granularity: string;
  },
): Promise<ProjectResult> {
  const startTime = Date.now();
  const url = `${options.baseUrl}/api/admin/otel-ingestion-replay`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 1 minute timeout

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${options.adminApiKey}`,
      },
      body: JSON.stringify({
        projectId,
        startDate: options.startDate,
        endDate: options.endDate,
        granularity: options.granularity,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const durationMs = Date.now() - startTime;
    const data = (await response.json()) as ApiResponse;

    if (!response.ok) {
      return {
        projectId,
        status: "error",
        durationMs,
        error: data.error || data.message || `HTTP ${response.status}`,
      };
    }

    return {
      projectId,
      status: "success",
      jobsQueued: data.jobsQueued ?? 0,
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;

    if (error instanceof Error && error.name === "AbortError") {
      return {
        projectId,
        status: "error",
        durationMs,
        error: "Request timed out after 60 seconds",
      };
    }

    return {
      projectId,
      status: "error",
      durationMs,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// Format duration for display
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  return `${(ms / 60000).toFixed(1)}m`;
}

// Print progress update
function printProgress(
  current: number,
  total: number,
  result: ProjectResult,
): void {
  const statusIcon = result.status === "success" ? "✅" : "❌";
  const jobsInfo =
    result.status === "success" ? ` (${result.jobsQueued} jobs queued)` : "";
  const errorInfo = result.error ? ` - ${result.error}` : "";

  console.log(
    `${statusIcon} [${current}/${total}] ${result.projectId}${jobsInfo}${errorInfo} (${formatDuration(result.durationMs)})`,
  );
}

// Print final summary
function printSummary(stats: ReplayStats): void {
  console.log("\n" + "=".repeat(60));
  console.log("📊 REPLAY SUMMARY");
  console.log("=".repeat(60));
  console.log(`Total projects:     ${stats.totalProjects}`);
  console.log(`Successful:         ${stats.successCount}`);
  console.log(`Failed:             ${stats.errorCount}`);
  console.log(`Skipped:            ${stats.skippedCount}`);
  console.log(`Total jobs queued:  ${stats.totalJobsQueued.toLocaleString()}`);
  console.log(`Total duration:     ${formatDuration(stats.totalDurationMs)}`);
  console.log("=".repeat(60));

  if (stats.errorCount > 0) {
    console.log("\n❌ FAILED PROJECTS:");
    stats.results
      .filter((r) => r.status === "error")
      .forEach((r) => {
        console.log(`  - ${r.projectId}: ${r.error}`);
      });
  }
}

// Write results to JSON file
function writeResultsToFile(stats: ReplayStats, outputPath: string): void {
  const absolutePath = path.resolve(outputPath);
  const output = {
    timestamp: new Date().toISOString(),
    summary: {
      totalProjects: stats.totalProjects,
      successCount: stats.successCount,
      errorCount: stats.errorCount,
      skippedCount: stats.skippedCount,
      totalJobsQueued: stats.totalJobsQueued,
      totalDurationMs: stats.totalDurationMs,
    },
    results: stats.results,
  };

  fs.writeFileSync(absolutePath, JSON.stringify(output, null, 2));
  console.log(`\n📁 Results written to: ${absolutePath}`);
}

// Main execution
async function main() {
  console.log("🚀 OTEL Ingestion Replay Script\n");

  try {
    // Parse arguments
    const options = parseArgs();

    // Validate dates
    const startDate = validateIsoDate(options.startDate, "start-date");
    const endDate = validateIsoDate(options.endDate, "end-date");

    if (startDate >= endDate) {
      throw new Error("start-date must be before end-date");
    }

    // Validate granularity
    if (!["hour", "minute"].includes(options.granularity)) {
      throw new Error('granularity must be "hour" or "minute"');
    }

    // Validate concurrency
    if (options.concurrency < 1 || options.concurrency > 50) {
      throw new Error("concurrency must be between 1 and 50");
    }

    // Parse projects file
    console.log(`📂 Reading projects from: ${options.projectsFile}`);
    const projectIds = parseProjectsFile(options.projectsFile);
    console.log(`📋 Found ${projectIds.length} project(s)\n`);

    // Display configuration
    console.log("Configuration:");
    console.log(`  Base URL:     ${options.baseUrl}`);
    console.log(`  Start Date:   ${options.startDate}`);
    console.log(`  End Date:     ${options.endDate}`);
    console.log(`  Granularity:  ${options.granularity}`);
    console.log(`  Concurrency:  ${options.concurrency}`);
    console.log(`  Output File:  ${options.output}`);
    console.log(`  Dry Run:      ${options.dryRun}`);
    console.log("");

    // Dry run mode - just show what would be processed
    if (options.dryRun) {
      console.log("🔍 DRY RUN MODE - No requests will be made\n");
      console.log("Projects that would be processed:");
      projectIds.forEach((id, index) => {
        console.log(`  ${index + 1}. ${id}`);
      });
      console.log(`\nTotal: ${projectIds.length} project(s)`);
      return;
    }

    // Process projects with concurrency limit
    console.log("🔄 Starting replay...\n");
    const limit = pLimit(options.concurrency);
    const overallStartTime = Date.now();

    const stats: ReplayStats = {
      totalProjects: projectIds.length,
      successCount: 0,
      errorCount: 0,
      skippedCount: 0,
      totalJobsQueued: 0,
      totalDurationMs: 0,
      results: [],
    };

    let completedCount = 0;

    const promises = projectIds.map((projectId) =>
      limit(async () => {
        const result = await replayProject(projectId, {
          baseUrl: options.baseUrl,
          adminApiKey: options.adminApiKey,
          startDate: options.startDate,
          endDate: options.endDate,
          granularity: options.granularity,
        });

        completedCount++;
        printProgress(completedCount, projectIds.length, result);

        return result;
      }),
    );

    const results = await Promise.all(promises);

    // Aggregate stats
    stats.totalDurationMs = Date.now() - overallStartTime;
    stats.results = results;

    for (const result of results) {
      if (result.status === "success") {
        stats.successCount++;
        stats.totalJobsQueued += result.jobsQueued ?? 0;
      } else if (result.status === "error") {
        stats.errorCount++;
      } else {
        stats.skippedCount++;
      }
    }

    // Print summary
    printSummary(stats);

    // Write results to file
    writeResultsToFile(stats, options.output);

    // Exit with error code if any projects failed
    if (stats.errorCount > 0) {
      console.log(
        `\n⚠️  Completed with ${stats.errorCount} error(s). Exit code: 1`,
      );
      process.exit(1);
    }

    console.log("\n✅ All projects processed successfully!");
  } catch (error) {
    console.error(
      "\n❌ Error:",
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  }
}

// Run the script
main();
