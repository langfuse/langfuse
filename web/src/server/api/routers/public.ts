import { VERSION } from "@/src/constants/VERSION";
import { env } from "@/src/env.mjs";
import { createTRPCRouter, publicProcedure } from "@/src/server/api/trpc";
import { logger } from "@langfuse/shared/src/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";

const versionSchema = z.string().regex(/^v\d+\.\d+\.\d+(?:[-+].+)?$/); // e.g. v1.2.3, v1.2.3-rc.1, v1.2.3+build.123

const compareVersions = (
  current: string,
  latest: string,
): "major" | "minor" | "patch" | null => {
  const currentValidated = versionSchema.parse(current);
  const latestValidated = versionSchema.parse(latest);

  const parseVersion = (version: string) => {
    if (version.startsWith("v")) {
      version = version.slice(1);
    }
    // Split into version and pre-release parts
    const [versionPart, ...rest] = version.split(/[-+]/);
    const numbers = versionPart.split(".").map(Number);
    return {
      numbers,
      isPreRelease: rest.length > 0,
    };
  };

  const current_parsed = parseVersion(currentValidated);
  const latest_parsed = parseVersion(latestValidated);

  const [currentMajor, currentMinor, currentPatch] = current_parsed.numbers;
  const [latestMajor, latestMinor, latestPatch] = latest_parsed.numbers;

  // If current is a pre-release (RC) and latest is a full release of the same version,
  // consider it as needing a patch update
  if (
    current_parsed.isPreRelease &&
    !latest_parsed.isPreRelease &&
    currentMajor === latestMajor &&
    currentMinor === latestMinor &&
    currentPatch === latestPatch
  ) {
    return "patch";
  }

  if (latestMajor > currentMajor) return "major";
  if (latestMajor === currentMajor && latestMinor > currentMinor)
    return "minor";
  if (
    latestMajor === currentMajor &&
    latestMinor === currentMinor &&
    latestPatch > currentPatch
  )
    return "patch";

  return null;
};

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
      logger.info(
        "[trpc.public.checkUpdate] failed to fetch latest-release api",
      );
      return null;
    }

    const releases = ReleaseApiRes.safeParse(body);
    if (!releases.success) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Release API response is invalid",
      });
    }
    const langfuseRelease = releases.data.find(
      (release) => release.repo === "langfuse/langfuse",
    );
    if (!langfuseRelease) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Release API response is invalid",
      });
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
