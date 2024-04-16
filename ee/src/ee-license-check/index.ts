import { env } from "../env";

export const isEeAvailable: boolean =
  env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION !== undefined;
