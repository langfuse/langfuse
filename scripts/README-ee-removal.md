# EE Import Removal Scripts

These scripts help you create FOSS (Free and Open Source Software) builds by removing all Enterprise Edition (EE) imports and replacing them with error-throwing code.

## Scripts Available

### 1. Node.js Version (`remove-ee-imports.js`)

- **More sophisticated**: Uses regex patterns to accurately identify and replace EE imports
- **Better error handling**: Provides detailed logging and error reporting
- **Requires**: Node.js and the `glob` package

### 2. Bash Version (`remove-ee-imports.sh`)

- **Simpler**: Uses standard Unix tools (sed, grep, find)
- **No dependencies**: Works on any Unix-like system
- **Faster**: For simple replacements

## Usage

### Option 1: Using npm scripts (Recommended)

```bash
# Install dependencies first
pnpm install

# Run the Node.js version
pnpm run remove-ee-imports

# Or run the bash version
pnpm run remove-ee-imports:bash
```

### Option 2: Direct execution

```bash
# Make scripts executable
chmod +x scripts/remove-ee-imports.js scripts/remove-ee-imports.sh

# Run Node.js version
./scripts/remove-ee-imports.js

# Run bash version
./scripts/remove-ee-imports.sh
```

### Option 3: Test the functionality

```bash
# Test how the script works with sample code
node scripts/test-remove-ee-imports.js
```

## What the Scripts Do

The scripts find and replace the following patterns:

### Static Imports

**Before:**

```typescript
import { BillingComponent } from "@/src/ee/features/billing/components";
import * as billing from "@/src/ee/features/billing/utils";
```

**After:**

```typescript
// EE import removed for FOSS build: import { BillingComponent } from "@/src/ee/features/billing/components";
// throw new Error("Enterprise feature not available in FOSS build: @/src/ee/features/billing/components");
```

### Dynamic Imports

**Before:**

```typescript
const module = await import("../ee/evaluation/evalService");
const regularImport = import("../ee/experiments/experimentService");
```

**After:**

```typescript
const module = Promise.reject(
  new Error(
    "Enterprise feature not available in FOSS build: ../ee/evaluation/evalService",
  ),
);
const regularImport = Promise.reject(
  new Error(
    "Enterprise feature not available in FOSS build: ../ee/experiments/experimentService",
  ),
);
```

### Export Re-exports

**Before:**

```typescript
export { SomeFeature } from "@/src/ee/features/admin-api/handlers";
```

**After:**

```typescript
// EE export removed for FOSS build: export { SomeFeature } from "@/src/ee/features/admin-api/handlers";
// throw new Error("Enterprise feature not available in FOSS build: @/src/ee/features/admin-api/handlers");
```

## Files Processed

The scripts process files in:

- `web/src/**/*.{ts,tsx,js,jsx}`
- `worker/src/**/*.{ts,tsx,js,jsx}`
- `packages/shared/src/**/*.{ts,tsx,js,jsx}`

**Excluded directories:**

- `node_modules/`
- `dist/`
- `build/`
- `.next/`
- `ee/` (EE source files themselves)

## After Running the Scripts

1. **Review the changes**: The scripts will show you which files were modified
2. **Run the linter**: `pnpm lint` to check for any syntax issues
3. **Run tests**: `pnpm test` to ensure functionality still works
4. **Manual review**: Some complex EE integrations may need manual fixes

## Build Integration

For automated FOSS builds, you can integrate this into your build pipeline:

```bash
# In your FOSS build script
pnpm run remove-ee-imports
pnpm run build
```

## Docker Integration

For Docker builds, you can use this in a multi-stage build:

```dockerfile
# FOSS build stage
FROM node:20 AS foss-builder
COPY . .
RUN pnpm install
RUN pnpm run remove-ee-imports
RUN pnpm run build

# Final stage
FROM node:20-slim
COPY --from=foss-builder /app/dist ./dist
# ... rest of your Dockerfile
```

## Troubleshooting

### Common Issues

1. **Syntax errors after processing**: Some complex EE integrations may need manual fixes
2. **Missing dependencies**: Make sure to run `pnpm install` before using the Node.js version
3. **Permission denied**: Make sure scripts are executable with `chmod +x`

### Manual Fixes

After running the script, you may need to manually:

- Remove unused imports that were commented out
- Fix TypeScript type errors where EE types were used
- Replace EE component usage with FOSS alternatives or error boundaries

## Contributing

If you find patterns that the scripts miss, please update the regex patterns in `remove-ee-imports.js` or the sed commands in `remove-ee-imports.sh`.
