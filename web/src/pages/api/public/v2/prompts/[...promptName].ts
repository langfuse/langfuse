import type { NextApiRequest, NextApiResponse } from "next";

import { promptNameHandler } from "@/src/features/prompts/server/handlers/promptNameHandler";
import { promptVersionHandler } from "@/src/features/prompts/server/handlers/promptVersionHandler";
import { prisma } from "@langfuse/shared/src/db";

const VERSION_SEGMENT = "versions";

const isVersionRoute = (segments: string[]) => {
  const versionSegmentIndex = segments.lastIndexOf(VERSION_SEGMENT);

  return (
    versionSegmentIndex > 0 &&
    versionSegmentIndex === segments.length - 2 &&
    /^\d+$/.test(segments[versionSegmentIndex + 1] ?? "")
  );
};

const promptExists = async (promptName: string) =>
  Boolean(
    await prisma.prompt.findFirst({
      where: { name: promptName },
      select: { id: true },
    }),
  );

const setPromptRouteQuery = async (req: NextApiRequest) => {
  const promptPath = req.query.promptName;
  const segments = (Array.isArray(promptPath) ? promptPath : [promptPath]).filter(
    (segment): segment is string => typeof segment === "string",
  );
  const promptName = segments.join("/");

  if (isVersionRoute(segments) && !(await promptExists(promptName))) {
    req.query.promptName = segments.slice(0, -2);
    req.query.promptVersion = segments[segments.length - 1];
    return promptVersionHandler;
  }

  req.query.promptName = segments;
  return promptNameHandler;
};

export default async function promptRouteHandler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  return (await setPromptRouteQuery(req))(req, res);
}
