import { env } from "@/src/env.mjs";
import { api } from "@/src/utils/api";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";

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

export const useOrganization = (organizationId: string | null) => {
  const session = useSession();
  const isAdmin = session.data?.user?.admin === true;

  // Always call hooks first, then handle conditional logic in the return
  const fromSession = organizationId
    ? session.data?.user?.organizations.find((org) => org.id === organizationId)
    : null;

  // Admin fallback: Langfuse admins are not members of customer orgs, so the
  // org is absent from their session. Resolve it from the admin-aware API
  // instead. The query is disabled for everyone else, so non-admins keep the
  // exact previous behavior (membership-only, no extra request).
  const adminFallback = api.organizations.byId.useQuery(
    { orgId: organizationId as string },
    {
      enabled: Boolean(organizationId) && isAdmin && !fromSession,
      staleTime: 60_000,
      // A stale/deleted org id is an expected miss for admins: resolve to
      // null like the session-only lookup, without retries, error toast, or
      // Sentry noise.
      retry: false,
      meta: { silentHttpCodes: [404] },
    },
  );

  if (fromSession) return fromSession;
  if (isAdmin) return adminFallback.data ?? null;
  return null;
};

export const useLangfuseCloudRegion = (): {
  isLangfuseCloud: boolean;
  region: string | undefined;
} => {
  return {
    isLangfuseCloud: Boolean(env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION),
    region: env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
  };
};

export const useLangfuseV4WriteMode = () => {
  const session = useSession();
  return session.data?.environment.v4WriteMode ?? null;
};
