export function getV4PreviewDisabledRedirect(
  pathname: string,
  projectId: string,
) {
  const evaluatorPath = "/project/[projectId]/evals";
  const sharedLegacyPaths = [
    `${evaluatorPath}/legacy`,
    `${evaluatorPath}/templates`,
    `${evaluatorPath}/default-model`,
    `${evaluatorPath}/remap`,
    `${evaluatorPath}/configs`,
  ];
  if (
    (pathname === evaluatorPath || pathname.startsWith(`${evaluatorPath}/`)) &&
    !sharedLegacyPaths.some((path) => pathname.startsWith(path))
  ) {
    return `/project/${projectId}/evals/legacy`;
  }

  if (pathname.startsWith("/project/[projectId]/experiments")) {
    return `/project/${projectId}/datasets`;
  }

  return null;
}

export function getV4PreviewEnabledRedirect(
  pathname: string,
  projectId: string,
) {
  return pathname.startsWith("/project/[projectId]/evals/legacy")
    ? `/project/${projectId}/evals`
    : null;
}
