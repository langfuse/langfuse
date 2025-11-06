import { VERSION } from "@/src/constants/VERSION";
import { env } from "@/src/env.mjs";
import { createTRPCRouter, publicProcedure } from "@/src/server/api/trpc";
import { logger, compareVersions } from "@langfuse/shared/src/server";
import { z } from "zod/v4";

const ReleaseApiRes = z.array(
  z.object({
    repo: z.string(),
    latestRelease: z.string(),
    publishedAt: z.string().datetime(),
    url: z.string().url(),
  }),
);

export const publicRouter = createTRPCRouter({
  checkUpdate: publicProcedure.query(async () => {
    // Skip update check on Langfuse Cloud
    if (env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) return null;

    let body;
    try {
      const response = await fetch(
        `https://langfuse.com/api/latest-releases?repo=langfuse/langfuse&version=${VERSION}`,
      );
      body = await response.json();
    } catch (error) {
      logger.error(
        "[trpc.public.checkUpdate] failed to fetch latest-release api",
        {
          error,
        },
      );
      return null;
    }

    const releases = ReleaseApiRes.safeParse(body);
    if (!releases.success) {
      logger.error(
        "[trpc.public.checkUpdate] Release API response is invalid, does not match schema",
        {
          error: releases.error,
        },
      );
      return null;
    }
    const langfuseRelease = releases.data.find(
      (release) => release.repo === "langfuse/langfuse",
    );
    if (!langfuseRelease) {
      logger.error(
        "[trpc.public.checkUpdate] Release API response is invalid, does not contain langfuse/langfuse",
      );
      return null;
    }

    const updateType = compareVersions(VERSION, langfuseRelease.latestRelease);

    return {
      updateType,
      currentVersion: VERSION,
      latestRelease: langfuseRelease.latestRelease,
      url: langfuseRelease.url,
    };
  }),
});
