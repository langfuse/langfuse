/* eslint-disable @typescript-eslint/no-use-before-define */
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";

import { env } from "@/src/env.mjs";
import { findSessionOrganization } from "@/src/features/rbac/new/sessionAccessors";
import { getSessionV4WriteMode } from "@/src/features/organizations/getSessionV4WriteMode";

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
