import { TRPCError } from "@trpc/server";

import { env } from "@/src/env.mjs";

export const isWebCalloutsEnabled = () =>
  env.LANGFUSE_ENABLE_WEB_CALLOUTS === "true";

export const throwIfWebCalloutsDisabled = () => {
  if (!isWebCalloutsEnabled()) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Web callouts are not enabled.",
    });
  }
};
