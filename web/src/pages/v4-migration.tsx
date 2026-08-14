import { useEffect } from "react";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";

/**
 * The standalone migration status page moved into organization settings as
 * the Health tab. The org id lives in the session rather than the URL, so
 * this is a client-side redirect; users with several organizations land on
 * their first one (the old page showed all orgs stacked — open question in
 * the PR whether multi-org users need a picker here).
 */
export default function V4MigrationRedirect() {
  const router = useRouter();
  const session = useSession();

  const firstOrgId = session.data?.user?.organizations?.[0]?.id;

  // The router is the external system: replace the route once the session
  // resolved. Unauthenticated visitors fall through to the sign-in redirect
  // the target page performs itself.
  useEffect(() => {
    if (session.status === "loading") return;
    router.replace(
      firstOrgId ? `/organization/${firstOrgId}/settings/health` : "/",
    );
  }, [session.status, firstOrgId, router]);

  return (
    <p className="text-muted-foreground p-4 text-sm">Redirecting to Health…</p>
  );
}
