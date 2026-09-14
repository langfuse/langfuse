import { GoogleAuth } from "google-auth-library";

const VERTEX_AI_AUTH_SCOPES = [
  "https://www.googleapis.com/auth/cloud-platform",
];

let projectIdPromise: Promise<string> | undefined;

/**
 * GCP project for Vertex requests that authenticate through application
 * default credentials.
 *
 * The AI SDK requires an explicit project for URL construction (it does not ask
 * the auth library), so callers that have no service account key resolve it
 * here instead.
 *
 * The answer is a property of the deployment's own credentials and cannot
 * change while the process runs, so it is resolved once. Without that, every
 * model build repeats the lookup, which falls through to the GCE metadata
 * server on Cloud Run and GKE — a round trip on each Assistant run, Ask AI
 * request and search-bar query. A rejection is not kept, so a transient
 * metadata failure does not poison the process.
 *
 * This lives apart from `vertex.ts` so the worker can reach it without a direct
 * dependency on google-auth-library, which pnpm's strict layout does not expose
 * to that package.
 */
export async function resolveVertexProjectIdFromADC(): Promise<string> {
  projectIdPromise ??= new GoogleAuth({ scopes: VERTEX_AI_AUTH_SCOPES })
    .getProjectId()
    .catch((error: unknown) => {
      projectIdPromise = undefined;
      throw error;
    });

  return projectIdPromise;
}
