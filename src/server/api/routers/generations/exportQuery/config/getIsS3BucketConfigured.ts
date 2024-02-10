import { type env } from "@/src/env.mjs";

type Env = typeof env;
type S3ConfiguredEnv = Env & {
  S3_ACCESS_KEY_ID: string;
  S3_SECRET_ACCESS_KEY: string;
  S3_ENDPOINT: string;
  S3_REGION: string;
};
export function getIsS3BucketConfigured(
  currentEnv: Env,
): currentEnv is S3ConfiguredEnv {
  return Boolean(
    currentEnv.S3_BUCKET_NAME &&
      currentEnv.S3_ACCESS_KEY_ID &&
      currentEnv.S3_SECRET_ACCESS_KEY &&
      currentEnv.S3_ENDPOINT &&
      currentEnv.S3_REGION,
  );
}
