import { VERSION } from "@/src/constants/VERSION";
import { env } from "@/src/env.mjs";
import { createTRPCRouter, publicProcedure } from "@/src/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

const versionSchema = z.string().regex(/^v\d+\.\d+\.\d+$/); // e.g. v1.2.3

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
    return version.split(".").map(Number);
  };

  const [currentMajor, currentMinor, currentPatch] =
    parseVersion(currentValidated);
  const [latestMajor, latestMinor, latestPatch] = parseVersion(latestValidated);

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

const isValidURL = (urlString: string): boolean => {
  try {
    const url = new URL(urlString);
    return url.protocol === "https:";
  } catch (error) {
    console.log(error);
    return false;
  }
};

const fetchImage = async (url: string): Promise<boolean> => {
  try {
    const response = await fetch(url, { method: "HEAD" });
    if (!response.ok) {
      return false;
    }

    const contentType = response.headers.get("content-type");
    const contentLength = response.headers.get("content-length");

    // ensure image is not larger than 1MB in size
    if (contentLength && parseInt(contentLength, 10) > 1 * 1024 * 1024) {
      return false;
    }

    return !!contentType && contentType.startsWith("image/");
  } catch (error) {
    console.log(error);
    return false;
  }
};

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
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to fetch or json parse the latest releases",
        cause: error,
      });
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
  validateImgUrl: publicProcedure
    .input(z.string().url())
    .query(async ({ input: url }) => {
      if (!isValidURL(url)) {
        return { valid: false };
      }

      const isValidImage = await fetchImage(url);
      return { valid: isValidImage };
    }),
});
