/* eslint-disable turbo/no-undeclared-env-vars -- runtime-only ECS/host detection, not a build input */
import { hostname } from "os";

/**
 * Stable per-task identifier for logs/metrics/spans.
 *
 * os.hostname() is unreliable on our ECS tasks — it returns the bind address
 * "0.0.0.0" — so prefer the container id embedded in the ECS task-metadata URI
 * (the same id Datadog exposes as the `container_id` tag). Fall back to
 * os.hostname()/HOSTNAME for local/dev where the metadata endpoint is absent.
 */
function resolveWorkerHostId(): string {
  const ecsUri =
    process.env.ECS_CONTAINER_METADATA_URI_V4 ??
    process.env.ECS_CONTAINER_METADATA_URI;
  const ecsContainerId = ecsUri?.split("/").filter(Boolean).pop();
  if (ecsContainerId) return ecsContainerId;

  const osHost = hostname();
  if (osHost && osHost !== "0.0.0.0" && osHost !== "localhost") return osHost;

  const envHost = process.env.HOSTNAME;
  if (envHost && envHost !== "0.0.0.0" && envHost !== "localhost")
    return envHost;

  return "unknown";
}

export const WORKER_HOST_ID = resolveWorkerHostId();
