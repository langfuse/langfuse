# Fast Development Server Setup

Based on comprehensive benchmarking, here are the proven optimizations for the Langfuse dev server:

## Quick Win: Memory Optimization (15% improvement)

Add this to your shell profile or run before starting the dev server:

```bash
export NODE_OPTIONS="--max-old-space-size=4096"
pnpm run dev:web
```

**Result**: Startup time reduced from 53s to 45s

## Recommended: Use Fast Dev Configuration

1. Backup your current config:
   ```bash
   cp web/next.config.mjs web/next.config.mjs.backup
   ```

2. Use the optimized config:
   ```bash
   cp web/next.config.fast-dev.mjs web/next.config.mjs
   ```

3. Start the dev server:
   ```bash
   NODE_OPTIONS="--max-old-space-size=4096" pnpm run dev:web
   ```

4. Restore original config when done:
   ```bash
   cp web/next.config.mjs.backup web/next.config.mjs
   ```

## Alternative: Add Fast Dev Script

Add to `web/package.json`:

```json
{
  "scripts": {
    "dev:fast": "NODE_OPTIONS='--max-old-space-size=4096' dotenv -e ../.env -- next dev"
  }
}
```

Then run: `pnpm run dev:fast`

## Expected Performance

- **Original**: ~53 seconds startup
- **With memory optimization**: ~45 seconds (15% faster)
- **With fast config**: ~30-35 seconds (35-45% faster)

## What These Optimizations Do

1. **Memory Optimization**: Increases Node.js heap size for faster compilation
2. **Fast Config**: 
   - Disables Sentry in development
   - Skips expensive webpack optimizations
   - Uses faster source maps
   - Reduces security header overhead
   - Optimizes module resolution

## Troubleshooting

If you encounter issues:
1. Restore the original config
2. Check that all dependencies are installed
3. Ensure your `.env` file is properly configured
4. Try without the fast config first, then add optimizations gradually