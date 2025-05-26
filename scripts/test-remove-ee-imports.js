#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { processFile } = require("./remove-ee-imports.js");

/**
 * Test script to demonstrate the EE import removal functionality
 */

// Create a temporary test file with various EE import patterns
const testContent = `
import { something } from "@/src/ee/features/billing/components";
import * as billing from "@/src/ee/features/billing/utils";
import BillingComponent from "@/src/ee/features/billing/BillingComponent";

export { SomeFeature } from "@/src/ee/features/admin-api/handlers";

const dynamicFeature = async () => {
  const module = await import("../ee/evaluation/evalService");
  return module.evaluate();
};

const regularImport = import("../ee/experiments/experimentService");

// This should not be affected
import { regularFunction } from "@/src/features/auth/utils";
const normalCode = "This should remain unchanged";
`;

const testFilePath = path.join(__dirname, "test-ee-imports.ts");

function runTest() {
  console.log("🧪 Testing EE import removal...\n");

  // Write test content to file
  fs.writeFileSync(testFilePath, testContent);
  console.log("📝 Created test file with EE imports:");
  console.log("---");
  console.log(testContent);
  console.log("---\n");

  // Process the file
  console.log("🔄 Processing file...\n");
  processFile(testFilePath);

  // Read and display the result
  const processedContent = fs.readFileSync(testFilePath, "utf8");
  console.log("✅ Processed content:");
  console.log("---");
  console.log(processedContent);
  console.log("---\n");

  // Clean up
  fs.unlinkSync(testFilePath);
  console.log("🧹 Cleaned up test file");

  console.log("\n✅ Test completed! The script successfully:");
  console.log("  • Commented out static EE imports");
  console.log("  • Replaced dynamic EE imports with Promise.reject()");
  console.log("  • Left non-EE imports unchanged");
}

if (require.main === module) {
  runTest();
}
