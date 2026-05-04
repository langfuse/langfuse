import type { NextApiRequest, NextApiResponse } from "next";

import { promptNameHandler } from "@/src/features/prompts/server/handlers/promptNameHandler";
import { promptVersionHandler } from "@/src/features/prompts/server/handlers/promptVersionHandler";

const VERSION_SEGMENT = "versions";

const setPromptRouteQuery = (req: NextApiRequest) => {
  const promptPath = req.query.promptName;
  const segments = Array.isArray(promptPath) ? promptPath : [promptPath];
  const versionSegmentIndex = segments.lastIndexOf(VERSION_SEGMENT);

  if (
    versionSegmentIndex > 0 &&
    versionSegmentIndex === segments.length - 2 &&
    req.method === "PATCH"
  ) {
    req.query.promptName = segments.slice(0, versionSegmentIndex);
    req.query.promptVersion = segments[versionSegmentIndex + 1];
    return promptVersionHandler;
  }

  req.query.promptName = segments;
  return promptNameHandler;
};

export default function promptRouteHandler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  return setPromptRouteQuery(req)(req, res);
}
