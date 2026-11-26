import { env } from "../../env";

/** Project gate for trace evals: Langfuse Cloud only, and the project is on the deployment allowlist. */
export function isTraceEvalsProjectEnabled(projectId: string): boolean {
  return (
    Boolean(env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) &&
    (env.LANGFUSE_TRACE_EVALS_ENABLED_PROJECT_IDS?.includes(projectId) ?? false)
  );
}
