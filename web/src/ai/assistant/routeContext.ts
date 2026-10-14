export function getInAppAgentProjectRoute(currentUrl: string):
  | {
      parsedUrl: URL;
      routeSegments: string[];
    }
  | undefined {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(currentUrl, "https://langfuse.local");
  } catch {
    return undefined;
  }

  const rawPathSegments = parsedUrl.pathname.split("/").filter(Boolean);
  const projectSegmentIndex = rawPathSegments.indexOf("project");

  if (
    projectSegmentIndex === -1 ||
    rawPathSegments.length <= projectSegmentIndex + 2
  ) {
    return undefined;
  }

  try {
    return {
      parsedUrl,
      routeSegments: rawPathSegments
        .slice(projectSegmentIndex + 2)
        .map((segment) => decodeURIComponent(segment)),
    };
  } catch {
    return undefined;
  }
}
