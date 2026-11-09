import { readFileSync, rmSync } from "node:fs";

const config = new URL("../.cargo/config.toml", import.meta.url);
try {
  const contents = readFileSync(config, "utf8");
  // Only remove the complete two-line file generated for the patched encoder.
  const generated =
    /^\[patch\.crates-io\]\r?\nclickhouse = \{ path = "[^"\r\n]+\/target\/\.clickhouse-source\/clickhouse-0\.15\.2" \}\r?\n?$/;
  if (generated.test(contents)) {
    rmSync(config, { force: true });
    console.log("Removed obsolete generated ClickHouse Cargo patch.");
  } else if (
    contents.includes("/target/.clickhouse-source/clickhouse-0.15.2")
  ) {
    console.warn(
      "Local .cargo/config.toml still references the obsolete ClickHouse patch. Remove that entry manually; custom configuration was left unchanged.",
    );
  }
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
