export function generateObjectLink(
  baseUrl: string,
  projectId: string,
  objectType: "TRACE" | "OBSERVATION" | "SESSION" | "PROMPT",
  objectId: string
): string {
  switch (objectType) {
    case "TRACE":
      return `${baseUrl}/project/${projectId}/traces/${objectId}`;
    case "OBSERVATION":
      // For observations, we need to link to the trace with the observation highlighted
      // We'll need to modify this once we have a better way to link directly to observations
      return `${baseUrl}/project/${projectId}/traces/${objectId}`;
    case "SESSION":
      return `${baseUrl}/project/${projectId}/sessions/${objectId}`;
    case "PROMPT":
      return `${baseUrl}/project/${projectId}/prompts/${objectId}`;
    default:
      // Fallback to project page
      return `${baseUrl}/project/${projectId}`;
  }
}