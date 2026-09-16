import { existsSync } from "node:fs";
import path from "node:path";
import { env } from "../../env";

export function isTopicsEnabled(): boolean {
  if (env.NODE_ENV !== "development" || !env.NEXTAUTH_URL) return false;
  try {
    return ["localhost", "127.0.0.1", "[::1]"].includes(
      new URL(env.NEXTAUTH_URL).hostname,
    );
  } catch {
    return false;
  }
}

export function getTopicsArtifactRoot(): string {
  let directory = path.resolve(process.cwd());
  while (!existsSync(path.join(directory, "pnpm-workspace.yaml"))) {
    const parent = path.dirname(directory);
    if (parent === directory)
      throw new Error(
        "Cannot locate the Langfuse workspace for Topics artifacts.",
      );
    directory = parent;
  }
  return path.join(directory, ".topics-data");
}
