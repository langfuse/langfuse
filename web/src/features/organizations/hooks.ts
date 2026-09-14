import { env } from "@/src/env.mjs";
import { api } from "@/src/utils/api";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";

/**
 * Hook to get the organization of the current page.
 */
export const useQueryOrganization = () => {
  return useQueryOrganizationLookup().organization;
};

/**
 * Same lookup as useQueryOrganization, plus whether an admin fallback
 * request is still in flight. Use this when a miss must not flash an
 * error page before the fallback resolves.
 */
export const useQueryOrganizationLookup = () => {
  const router = useRouter();
  const organizationId = router.query.organizationId;
  return useOrganization(
    typeof organizationId === "string" ? organizationId : null,
  );
};

const useOrganization = (organizationId: string | null) => {
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
  const adminFallbackEnabled =
    Boolean(organizationId) && isAdmin && !fromSession;
  const adminFallback = api.organizations.byId.useQuery(
    { orgId: organizationId as string },
    {
      enabled: adminFallbackEnabled,
      staleTime: 60_000,
      // A stale/deleted org id is an expected miss for admins: resolve to
      // null like the session-only lookup, without retries, error toast, or
      // Sentry noise.
      retry: false,
      meta: { silentHttpCodes: [404] },
    },
  );

  return {
    organization:
      fromSession ?? (isAdmin ? (adminFallback.data ?? null) : null),
    isPending:
      session.status === "loading" ||
      (adminFallbackEnabled && adminFallback.isLoading),
  };
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
  return session.data?.environment.v4WriteMode ?? null;
};
