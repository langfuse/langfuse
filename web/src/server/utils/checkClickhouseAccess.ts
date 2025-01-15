import { env } from "@/src/env.mjs";
import { type User } from "next-auth";

export const isClickhouseAdminEligible = (user?: User | null) => {
  return (
    user &&
    user.admin &&
    user.admin === true &&
    env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION &&
    ["US", "EU", "STAGING", "DEV"].includes(
      env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
    )
  );
};

export const measureAndReturnApi = async <T, Y>(args: {
  input: T & { queryClickhouse: boolean; projectId?: string };
  user: User | undefined | null;
  operation: string;
  pgExecution: (input: T) => Promise<Y>;
  clickhouseExecution: (input: T) => Promise<Y>;
}) => {
  const { input, clickhouseExecution } = args;
  return await clickhouseExecution(input);
};
