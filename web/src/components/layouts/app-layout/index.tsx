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
import { signOut } from "next-auth/react";
import posthog from "posthog-js";
import { env } from "@/src/env.mjs";
import { useQueryProjectOrOrganization } from "@/src/features/projects/hooks";
import { ErrorPageWithSentry } from "@/src/components/error-page";

// Layout variants
import { LoadingLayout } from "./variants/LoadingLayout";
import { UnauthenticatedLayout } from "./variants/UnauthenticatedLayout";
import { MinimalLayout } from "./variants/MinimalLayout";
import { AuthenticatedLayout } from "./variants/AuthenticatedLayout";

// Custom hooks
import { useAuthSession } from "./hooks/useAuthSession";
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
  const session = useAuthSession();
  const { organization } = useQueryProjectOrOrganization();

  // Determine layout configuration
  const { variant, hideNavigation, isPublishable } = useLayoutConfiguration(
    session.data ?? null,
  );

  // Check authentication and redirects
  const authGuard = useAuthGuard(session, hideNavigation);

  // Check project access
  const projectAccess = useProjectAccess(session.data ?? null);

  // IMPORTANT: Call all hooks before any conditional returns
  // Load navigation and metadata (even if not used in all render paths)
  const navigation = useFilteredNavigation(session.data ?? null, organization);
  const activePathName = navigation.navigation.find(
    (item) => item.isActive,
  )?.title;
  const metadata = useLayoutMetadata(activePathName, navigation.navigation);

  // Handle auth guard actions (redirect or sign-out)
  useEffect(() => {
    if (authGuard.action === "redirect") {
      void router.replace(authGuard.url);
    } else if (authGuard.action === "sign-out") {
      void signOut({ redirect: false });
    }
  }, [authGuard, router]);

  // Loading or redirecting state
  if (
    authGuard.action === "loading" ||
    authGuard.action === "redirect" ||
    authGuard.action === "sign-out"
  ) {
    return <LoadingLayout message={authGuard.message} />;
  }

  // Project access denied - handle based on path type
  if (session.status === "authenticated" && !projectAccess.hasAccess) {
    // For publishable paths (shared traces/sessions), render minimal layout without sidebar
    // This allows authenticated users to view shared content without seeing project navigation
    if (isPublishable) {
      return <MinimalLayout>{props.children}</MinimalLayout>;
    }

    // For non-publishable paths, show error page
    return (
      <ErrorPageWithSentry
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
    return <MinimalLayout>{props.children}</MinimalLayout>;
  }

  // Render minimal layout (onboarding, public routes)
  if (hideNavigation) {
    return <MinimalLayout>{props.children}</MinimalLayout>;
  }

  // Authenticated layout
  // At this point, all auth guards have passed and session.data is guaranteed to exist
  // The authGuard hook ensures we don't reach here without a valid session
  if (!session.data) {
    // This should never happen due to guards above, but TypeScript needs this
    return <LoadingLayout message="Loading" />;
  }

  const handleSignOut = async () => {
    sessionStorage.clear();
    if (env.NEXT_PUBLIC_POSTHOG_KEY && env.NEXT_PUBLIC_POSTHOG_HOST) {
      posthog.reset();
    }
    await signOut({
      callbackUrl: `${env.NEXT_PUBLIC_BASE_PATH ?? ""}/auth/sign-in`,
    });
  };

  return (
    <AuthenticatedLayout
      session={session.data}
      navigation={navigation}
      metadata={metadata}
      onSignOut={handleSignOut}
    >
      {props.children}
    </AuthenticatedLayout>
  );
}
