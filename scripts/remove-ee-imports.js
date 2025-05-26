#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const glob = require("glob");

/**
 * Script to remove all conditional references which contain /ee/ in the path
 * and replace them with exceptions for FOSS builds.
 */

// Configuration
const SEARCH_PATTERNS = [
  "web/src/**/*.{ts,tsx,js,jsx}",
  "worker/src/**/*.{ts,tsx,js,jsx}",
  "packages/shared/src/**/*.{ts,tsx,js,jsx}",
];

const EXCLUDE_PATTERNS = [
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/.next/**",
  "**/ee/**", // Don't process EE files themselves
];

// Regex patterns to find EE imports
const IMPORT_PATTERNS = [
  // Static imports: import { something } from "@/src/ee/..."
  /import\s+(?:{[^}]*}|\*\s+as\s+\w+|\w+)\s+from\s+["']([^"']*\/ee\/[^"']*)["']/g,

  // Dynamic imports: await import("../ee/...")
  /await\s+import\s*\(\s*["']([^"']*\/ee\/[^"']*)["']\s*\)/g,

  // Regular dynamic imports: import("../ee/...")
  /import\s*\(\s*["']([^"']*\/ee\/[^"']*)["']\s*\)/g,

  // Export re-exports: export { something } from "@/src/ee/..."
  /export\s+(?:{[^}]*}|\*)\s+from\s+["']([^"']*\/ee\/[^"']*)["']/g,
];

function findAllFiles() {
  const allFiles = [];

  for (const pattern of SEARCH_PATTERNS) {
    const files = glob.sync(pattern, {
      ignore: EXCLUDE_PATTERNS,
      absolute: true,
    });
    allFiles.push(...files);
  }

  // Remove duplicates
  return [...new Set(allFiles)];
}

function processFile(filePath) {
  console.log(`Processing: ${path.relative(process.cwd(), filePath)}`);

  let content = fs.readFileSync(filePath, "utf8");
  let modified = false;

  // Track all EE imports found in this file
  const eeImports = new Set();

  // Find all EE imports first
  for (const pattern of IMPORT_PATTERNS) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      eeImports.add(match[1]); // Store the import path
    }
    pattern.lastIndex = 0; // Reset regex
  }

  if (eeImports.size === 0) {
    return false; // No EE imports found
  }

  console.log(`  Found EE imports: ${Array.from(eeImports).join(", ")}`);

  // Replace static imports
  content = content.replace(
    /import\s+(?:{[^}]*}|\*\s+as\s+\w+|\w+)\s+from\s+["']([^"']*\/ee\/[^"']*)["']/g,
    (match, importPath) => {
      modified = true;
      return `// EE import removed for FOSS build: ${match}\n// throw new Error("Enterprise feature not available in FOSS build: ${importPath}");`;
    },
  );

  // Replace export re-exports
  content = content.replace(
    /export\s+(?:{[^}]*}|\*)\s+from\s+["']([^"']*\/ee\/[^"']*)["']/g,
    (match, importPath) => {
      modified = true;
      return `// EE export removed for FOSS build: ${match}\n// throw new Error("Enterprise feature not available in FOSS build: ${importPath}");`;
    },
  );

  // Replace dynamic imports with error throwing
  content = content.replace(
    /(await\s+)?import\s*\(\s*["']([^"']*\/ee\/[^"']*)["']\s*\)/g,
    (match, awaitKeyword, importPath) => {
      modified = true;
      if (awaitKeyword) {
        return `Promise.reject(new Error("Enterprise feature not available in FOSS build: ${importPath}"))`;
      } else {
        return `Promise.reject(new Error("Enterprise feature not available in FOSS build: ${importPath}"))`;
      }
    },
  );

  // Handle function calls that might use EE imports
  // Look for patterns where imported EE functions are called
  for (const eeImport of eeImports) {
    const importName = path.basename(eeImport, path.extname(eeImport));

    // Replace function calls with error throwing
    const functionCallPattern = new RegExp(
      `\\b(${importName}\\w*)\\s*\\([^)]*\\)`,
      "g",
    );

    content = content.replace(functionCallPattern, (match, functionName) => {
      // Only replace if it looks like a function call from an EE import
      if (match.includes("(")) {
        modified = true;
        return `(() => { throw new Error("Enterprise feature not available in FOSS build: ${functionName} from ${eeImport}"); })()`;
      }
      return match;
    });
  }

  if (modified) {
    fs.writeFileSync(filePath, content, "utf8");
    console.log(`  ✓ Modified file`);
  }

  return modified;
}

function main() {
  console.log("🔍 Finding files with EE imports...");

  const files = findAllFiles();
  console.log(`Found ${files.length} files to process`);

  let modifiedCount = 0;

  for (const file of files) {
    try {
      if (processFile(file)) {
        modifiedCount++;
      }
    } catch (error) {
      console.error(`❌ Error processing ${file}:`, error.message);
    }
  }

  console.log(`\n✅ Completed! Modified ${modifiedCount} files.`);
  console.log(
    "\n⚠️  Note: You may need to manually review and fix some files where EE functionality is deeply integrated.",
  );
  console.log(
    "💡 Consider running your linter and tests after this transformation.",
  );
}

// Run the script
if (require.main === module) {
  main();
}

module.exports = { processFile, findAllFiles };
