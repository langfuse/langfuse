/**
 * App Layout
 *
 * Improved maintainability through:
 * - Separation of concerns via custom hooks
 * - Composable navigation filters
 * - Layout variant components
 * - Memoization for performance
 *
 */

import { type PropsWithChildren, useEffect } from "react";
import { useRouter } from "next/router";
import { signOut, useSession } from "next-auth/react";
import { signOutCleanly } from "@/src/features/auth/lib/signOut";
import { clearV4BetaEnabledSentryTag } from "@/src/utils/sentryV4BetaTag";
import { useQueryProjectOrOrganization } from "@/src/features/projects/hooks";
import { ErrorPage } from "@/src/components/error-page";

// Layout variants
import { LoadingLayout } from "./variants/LoadingLayout";
import { UnauthenticatedLayout } from "./variants/UnauthenticatedLayout";
import { MinimalLayout } from "./variants/MinimalLayout";
import { AuthenticatedLayout } from "./variants/AuthenticatedLayout";

// Custom hooks
import { useLayoutConfiguration } from "./hooks/useLayoutConfiguration";
import { useAuthGuard } from "./hooks/useAuthGuard";
import { useProjectAccess } from "./hooks/useProjectAccess";
import { useFilteredNavigation } from "./hooks/useFilteredNavigation";
import { useLayoutMetadata } from "./hooks/useLayoutMetadata";

/**
 * Main layout component
 * Determines which layout variant to render based on:
 * - Authentication state
 * - Current route
 * - Project access
 * - User permissions
 */
export function AppLayout(props: PropsWithChildren) {
  const router = useRouter();
  const session = useSession();
  const { organization } = useQueryProjectOrOrganization();

  // `session.update()` reports `loading` with the previous session still in
  // hand. Rendering the loading layout for that replaces `children` and throws
  // away everything unsaved in them, so keep the shell that is already on
  // screen; only a cold load has no session to keep showing.
  const sessionData = session.data ?? null;
  const isRecheckingSession = session.status === "loading" && !!sessionData;

  // Determine layout configuration
  const { variant, hideNavigation, isPublishable } =
    useLayoutConfiguration(sessionData);

  // Check authentication and redirects
  const authGuard = useAuthGuard(session, hideNavigation);

  // Check project access
  const projectAccess = useProjectAccess(sessionData);

  // IMPORTANT: Call all hooks before any conditional returns
  // Load navigation and metadata (even if not used in all render paths)
  const navigation = useFilteredNavigation(sessionData, organization);
  const activePathName = navigation.navigation.find(
    (item) => item.isActive,
  )?.title;
  const metadata = useLayoutMetadata(activePathName, navigation.navigation);

  // Handle auth guard actions (redirect or sign-out)
  useEffect(() => {
    if (authGuard.action === "redirect") {
      router.replace(authGuard.url);
    } else if (authGuard.action === "sign-out") {
      // Invalid JWT user: stay on this page (redirect: false) but still drop
      // the pageload v4 cache so a later hard load is not tagged as the
      // previous user.
      clearV4BetaEnabledSentryTag();
      signOut({ redirect: false });
    }
  }, [authGuard, router]);

  // Loading or redirecting state. Loading only applies to a cold load: once a
  // shell has rendered, a re-check keeps it instead of unmounting it.
  if (
    (authGuard.action === "loading" && !isRecheckingSession) ||
    authGuard.action === "redirect" ||
    authGuard.action === "sign-out"
  ) {
    return <LoadingLayout message={authGuard.message} />;
  }

  // Project access denied - handle based on path type. Only a settled session
  // can rule a project out: while one is in flight the URL can legitimately
  // point at a project the previous session did not have yet (just created).
  if (session.status === "authenticated" && !projectAccess.hasAccess) {
    // For publishable paths (shared traces/sessions), render minimal layout without sidebar
    // This allows authenticated users to view shared content without seeing project navigation
    if (isPublishable) {
      return <MinimalLayout fullBleed>{props.children}</MinimalLayout>;
    }

    // For non-publishable paths, show error page. This is an EXPECTED state (an
    // authenticated user opened a project they can't access or that no longer
    // exists) that the UI already renders — so use the non-capturing ErrorPage
    // rather than ErrorPageWithSentry, which otherwise mints a Sentry issue on
    // every mount (thousands of events / hundreds of users of pure noise).
    return (
      <ErrorPage
        title="Project Not Found"
        message="The project you are trying to access does not exist or you do not have access to it."
        additionalButton={{
          label: "Go to Home",
          href: "/",
        }}
      />
    );
  }

  // Unauthenticated layout (sign-in, sign-up)
  // Must check variant BEFORE hideNavigation since auth pages set hideNavigation=true
  if (variant === "unauthenticated") {
    return <UnauthenticatedLayout>{props.children}</UnauthenticatedLayout>;
  }

  // Publishable paths (traces, sessions) when unauthenticated
  // Render minimal layout without navigation/sidebar
  if (isPublishable && session.status === "unauthenticated") {
    return <MinimalLayout fullBleed>{props.children}</MinimalLayout>;
  }

  // Render minimal layout (onboarding, public routes)
  if (hideNavigation) {
    return <MinimalLayout>{props.children}</MinimalLayout>;
  }

  // Authenticated layout
  // At this point, all auth guards have passed and session.data is guaranteed to exist
  // The authGuard hook ensures we don't reach here without a valid session
  if (!sessionData?.user) {
    // This should never happen due to guards above, but TypeScript needs this
    return <LoadingLayout message="Loading" />;
  }

  return (
    <AuthenticatedLayout
      user={sessionData.user}
      navigation={navigation}
      metadata={metadata}
      onSignOut={signOutCleanly}
    >
      {props.children}
    </AuthenticatedLayout>
  );
}
