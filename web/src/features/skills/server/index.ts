import { env } from "@/src/env.mjs";
import { prisma } from "@langfuse/shared/src/db";
import { getSkillStorageClient } from "./getSkillStorageClient";
import { SkillService } from "./skill-service";

export function getSkillService(): SkillService {
  const { bucketName, client } = getSkillStorageClient();
  return new SkillService(
    prisma,
    client,
    bucketName,
    env.LANGFUSE_S3_MEDIA_UPLOAD_PREFIX ?? "",
  );
}

export { SkillService } from "./skill-service";
