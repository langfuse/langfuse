import { assertFipsMode } from "@langfuse/shared/src/server/ee/fips";

// Side-effect module: index.ts imports it before anything that connects to
// Redis, Postgres or ClickHouse, so FIPS mode also holds when a deployment
// overrides the image's entrypoint.sh.
try {
  assertFipsMode();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
