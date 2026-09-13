import { GoogleAuth } from "google-auth-library";

export const VERTEX_AI_AUTH_SCOPES = [
  "https://www.googleapis.com/auth/cloud-platform",
];

/**
 * GCP project for Vertex requests that authenticate through application
 * default credentials.
 *
 * The AI SDK requires an explicit project for URL construction (it does not ask
 * the auth library), so callers that have no service account key resolve it
 * from the default credential chain here.
 *
 * This module deliberately imports no AI SDK package: the worker runs the
 * in-app agent on a different AI SDK generation than shared and reaches this
 * helper through the shared barrel, so pulling a provider in here would load a
 * second, mismatched copy into the worker.
 */
export async function resolveVertexProjectIdFromADC(): Promise<string> {
  return new GoogleAuth({ scopes: VERTEX_AI_AUTH_SCOPES }).getProjectId();
}
