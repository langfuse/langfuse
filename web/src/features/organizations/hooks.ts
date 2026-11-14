/* eslint-disable @typescript-eslint/no-use-before-define */
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";

import { env } from "@/src/env.mjs";
import {
  findSessionOrganization,
  getSessionEnvironment,
  type MaybeSession,
} from "@/src/features/auth/lib/sessionAccessors";

/**
 * Hook to get the organization of the current page.
 */
export const useQueryOrganization = () => {
  const router = useRouter();
  const organizationId = router.query.organizationId;
  return useOrganization(
    typeof organizationId === "string" ? organizationId : null,
  );
};

const useOrganization = (organizationId: string | null) => {
  const session = useSession();

  if (!organizationId) return null;

  return findSessionOrganization(session.data, organizationId) ?? null;
};

export const useLangfuseCloudRegion = () => {
  const region = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION ?? undefined;

  if (!region) {
    return {
      isLangfuseCloud: false,
      region: undefined,
    } as const;
  }

  return {
    isLangfuseCloud: true,
    region,
  } as const;
};

export const useLangfuseV4WriteMode = () => {
  const session = useSession();
  return getSessionV4WriteMode(session.data);
};

/** getSessionV4WriteMode is the deployment's v4 write mode, or null when the session does not carry one. */
function getSessionV4WriteMode(session: MaybeSession) {
  return getSessionEnvironment(session)?.v4WriteMode ?? null;
}
