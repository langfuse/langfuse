import {
  createLocalSandboxSnapshotStore,
  createS3SandboxSnapshotStore,
} from "./snapshotStore";
import { env } from "@/src/env.mjs";

export type InAppAgentSandboxProviderName =
  | "dangerous-docker"
  | "lambda-microvm";

export function getDefaultInAppAgentSandboxProviderName(): InAppAgentSandboxProviderName {
  return (
    env.LANGFUSE_IN_APP_AGENT_SANDBOX_PROVIDER ??
    (env.NODE_ENV === "development" ? "dangerous-docker" : "lambda-microvm")
  );
}

export function getInAppAgentSandboxSnapshotStore(
  providerName?: string | null,
) {
  if ((providerName ?? getDefaultInAppAgentSandboxProviderName()) === "dangerous-docker") {
    return createLocalSandboxSnapshotStore({
      baseDir: env.LANGFUSE_IN_APP_AGENT_SANDBOX_LOCAL_SNAPSHOT_DIR,
    });
  }

  if (!env.LANGFUSE_IN_APP_AGENT_SANDBOX_SNAPSHOT_BUCKET) {
    return {
      deleteSnapshot: async () => undefined,
      getSnapshot: async () => null,
      putSnapshot: async () => undefined,
    };
  }

  return createS3SandboxSnapshotStore({
    accessKeyId: env.LANGFUSE_IN_APP_AGENT_SANDBOX_SNAPSHOT_ACCESS_KEY_ID,
    bucket: env.LANGFUSE_IN_APP_AGENT_SANDBOX_SNAPSHOT_BUCKET,
    endpoint: env.LANGFUSE_IN_APP_AGENT_SANDBOX_SNAPSHOT_ENDPOINT,
    forcePathStyle:
      env.LANGFUSE_IN_APP_AGENT_SANDBOX_SNAPSHOT_FORCE_PATH_STYLE === "true",
    prefix: env.LANGFUSE_IN_APP_AGENT_SANDBOX_SNAPSHOT_PREFIX,
    region: env.LANGFUSE_IN_APP_AGENT_SANDBOX_SNAPSHOT_REGION,
    secretAccessKey: env.LANGFUSE_IN_APP_AGENT_SANDBOX_SNAPSHOT_SECRET_ACCESS_KEY,
  });
}

export async function deleteInAppAgentSandboxSnapshot(params: {
  providerName?: string | null;
  snapshotKey: string;
}) {
  const store = getInAppAgentSandboxSnapshotStore(params.providerName);
  await store.deleteSnapshot(params.snapshotKey);
}
