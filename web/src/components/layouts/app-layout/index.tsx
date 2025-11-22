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
import { useQueryProjectOrOrganization } from "@/src/features/projects/hooks";
import { ErrorPage } from "@/src/components/error-page";

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
    if (authGuard.type === "redirect") {
      void router.replace(authGuard.url);
    } else if (authGuard.type === "sign-out") {
      void signOut({ redirect: false });
    }
  }, [authGuard, router]);

  // Loading or redirecting state
  if (
    authGuard.type === "loading" ||
    authGuard.type === "redirect" ||
    authGuard.type === "sign-out"
  ) {
    return <LoadingLayout message={authGuard.message} />;
  }

  // Project access denied - only check for authenticated users on non-publishable paths
  // Publishable paths (traces, sessions) should be accessible without authentication
  if (
    session.status === "authenticated" &&
    !isPublishable &&
    !projectAccess.hasAccess
  ) {
    return (
      <ErrorPage
        title="Unauthorized"
        message="User is not a member of this project"
      />
    );
  }

  // Render minimal layout (onboarding, public routes)
  if (hideNavigation) {
    return <MinimalLayout>{props.children}</MinimalLayout>;
  }

  // Unauthenticated layout (sign-in, sign-up)
  if (variant === "unauthenticated") {
    return <UnauthenticatedLayout>{props.children}</UnauthenticatedLayout>;
  }

  // Publishable paths (traces, sessions) when unauthenticated
  // Render minimal layout without navigation/sidebar
  if (isPublishable && session.status === "unauthenticated") {
    return <MinimalLayout>{props.children}</MinimalLayout>;
  }

  // Authenticated layout
  const handleSignOut = () => {
    void signOut({ redirect: false });
  };

  return (
    <AuthenticatedLayout
      session={session.data!}
      navigation={navigation}
      metadata={metadata}
      onSignOut={handleSignOut}
    >
      {props.children}
    </AuthenticatedLayout>
  );
}
