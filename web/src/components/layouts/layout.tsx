import { type Route } from "@/src/components/layouts/routes";
import { type PropsWithChildren, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { getSession, signOut, useSession } from "next-auth/react";
import Head from "next/head";
import { env } from "@/src/env.mjs";
import { Spinner } from "@/src/components/layouts/spinner";
import { hasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { Toaster } from "@/src/components/ui/sonner";
import DOMPurify from "dompurify";
import { ThemeToggle } from "@/src/features/theming/ThemeToggle";
import { useQueryProjectOrOrganization } from "@/src/features/projects/hooks";
import { useEntitlements } from "@/src/features/entitlements/hooks";
import { useUiCustomization } from "@/src/ee/features/ui-customization/useUiCustomization";
import { hasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { SidebarInset, SidebarProvider } from "@/src/components/ui/sidebar";
import { AppSidebar } from "@/src/components/nav/app-sidebar";
import { CommandMenu } from "@/src/features/command-k-menu/CommandMenu";
import { SupportDrawer } from "@/src/features/support-chat/SupportDrawer";
import { useSupportDrawer } from "@/src/features/support-chat/SupportDrawerProvider";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/src/components/ui/resizable";
import {
  PaymentBanner,
  PaymentBannerProvider,
} from "@/src/features/payment-banner";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/src/components/ui/drawer";
import { useMediaQuery } from "react-responsive";
import {
  processNavigation,
  type NavigationItem,
} from "@/src/components/layouts/utilities/routes";
import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";

const signOutUser = async () => {
  sessionStorage.clear();

  await signOut();
};

const getUserNavigation = () => {
  return [
    {
      name: "Account Settings",
      href: "/account/settings",
    },
    {
      name: "Theme",
      onClick: () => {},
      content: <ThemeToggle />,
    },
    {
      name: "Sign out",
      onClick: signOutUser,
    },
  ];
};

const pathsWithoutNavigation: string[] = [
  "/onboarding",
  "/auth/reset-password",
];
const unauthenticatedPaths: string[] = [
  "/auth/sign-in",
  "/auth/sign-up",
  "/auth/error",
  "/auth/hf-spaces",
];
// auth or unauthed
const publishablePaths: string[] = [
  "/project/[projectId]/sessions/[sessionId]",
  "/project/[projectId]/traces/[traceId]",
  "/auth/reset-password",
];

/**
 * Patched version of useSession that retries fetching the session if the user
 * is unauthenticated. This is useful to mitigate exceptions on the
 * /api/auth/session endpoint which cause the session to be unauthenticated even
 * though the user is signed in.
 */
function useSessionWithRetryOnUnauthenticated() {
  const MAX_RETRIES = 2;
  const [retryCount, setRetryCount] = useState(0);
  const session = useSession();

  useEffect(() => {
    if (session.status === "unauthenticated" && retryCount < MAX_RETRIES) {
      const fetchSession = async () => {
        try {
          await getSession({ broadcast: true });
        } catch (error) {
          console.error(
            "Error fetching session:",
            error,
            "\nError details:",
            JSON.stringify(error, null, 2),
          );
          throw error;
        }
        setRetryCount((prevCount) => prevCount + 1);
      };
      fetchSession();
    }
    if (session.status === "authenticated" && retryCount > 0) {
      setRetryCount(0);
    }
  }, [session.status, retryCount]);

  return session.status !== "unauthenticated" || retryCount >= MAX_RETRIES
    ? session
    : { ...session, status: "loading" };
}

export default function Layout(props: PropsWithChildren) {
  const router = useRouter();
  const routerProjectId = router.query.projectId as string | undefined;
  const routerOrganizationId = router.query.organizationId as
    | string
    | undefined;
  const session = useSessionWithRetryOnUnauthenticated();
  const { isLangfuseCloud, region } = useLangfuseCloudRegion();

  const enableExperimentalFeatures =
    session.data?.environment.enableExperimentalFeatures ?? false;

  const entitlements = useEntitlements();

  const uiCustomization = useUiCustomization();

  const cloudAdmin = isLangfuseCloud && session.data?.user?.admin === true;

  // project info based on projectId in the URL
  const { project, organization } = useQueryProjectOrOrganization();

  // Helper function for precise path matching
  const isPathActive = (routePath: string, currentPath: string): boolean => {
    // Exact match
    if (currentPath === routePath) return true;

    // Only allow prefix matching if the route ends with a specific page (not just project root)
    // This prevents /project/123 from matching /project/123/datasets
    const isRoot = routePath.split("/").length <= 3;
    if (isRoot) return false;

    return currentPath.startsWith(routePath + "/");
  };

  const mapNavigation = (route: Route): NavigationItem | null => {
    // Project-level routes
    if (!routerProjectId && route.pathname.includes("[projectId]")) return null;
    // Organization-level routes
    if (!routerOrganizationId && route.pathname.includes("[organizationId]"))
      return null;

    // UI customization – hide routes that belong to a disabled product module
    if (
      route.productModule &&
      uiCustomization !== null &&
      !uiCustomization.visibleModules.includes(route.productModule)
    )
      return null;

    // Feature Flags
    if (
      route.featureFlag !== undefined &&
      !enableExperimentalFeatures &&
      !cloudAdmin &&
      session.data?.user?.featureFlags[route.featureFlag] !== true
    )
      return null;

    // check entitlements
    if (
      route.entitlements !== undefined &&
      !route.entitlements.some((entitlement) =>
        entitlements.includes(entitlement),
      ) &&
      !cloudAdmin
    )
      return null;

    // RBAC
    if (
      route.projectRbacScopes !== undefined &&
      !cloudAdmin &&
      (!project ||
        !organization ||
        !route.projectRbacScopes.some((scope) =>
          hasProjectAccess({
            projectId: project.id,
            scope,
            session: session.data,
          }),
        ))
    )
      return null;
    if (
      route.organizationRbacScope !== undefined &&
      !cloudAdmin &&
      (!organization ||
        !hasOrganizationAccess({
          organizationId: organization.id,
          scope: route.organizationRbacScope,
          session: session.data,
        }))
    )
      return null;

    // check show function
    if (route.show && !route.show({ organization: organization ?? undefined }))
      return null;

    // apply to children as well
    const items: (NavigationItem | null)[] =
      route.items?.map((item) => mapNavigation(item)).filter(Boolean) ?? [];

    const url = route.pathname

      ?.replace("[projectId]", routerProjectId ?? "")
      .replace("[organizationId]", routerOrganizationId ?? "");

    return {
      ...route,
      url: url,
      isActive: isPathActive(route.pathname, router.pathname),
      items:
        items.length > 0
          ? (items as NavigationItem[]) // does not include null due to filter
          : undefined,
    };
  };

  // Process navigation using the dedicated utility
  const { mainNavigation, secondaryNavigation, navigation } =
    processNavigation(mapNavigation);

  const activePathName = navigation.find((item) => item.isActive)?.title;

  if (session.status === "loading") return <Spinner message="Loading" />;

  // If the user has a token, but does not exist in the database, sign them out
  if (
    session.data &&
    session.data.user === null &&
    !unauthenticatedPaths.includes(router.pathname) &&
    !publishablePaths.includes(router.pathname) &&
    !router.pathname.startsWith("/public/")
  ) {
    console.warn("Layout: User was signed out as db user was not found");
    signOutUser();

    return <Spinner message="Redirecting" />;
  }

  if (
    session.status === "unauthenticated" &&
    !unauthenticatedPaths.includes(router.pathname) &&
    !publishablePaths.includes(router.pathname) &&
    !router.pathname.startsWith("/public/")
  ) {
    const newTargetPath = router.asPath;
    if (newTargetPath && newTargetPath !== "/") {
      void router.replace(
        `/auth/sign-in?targetPath=${encodeURIComponent(newTargetPath)}`,
      );
    } else {
      void router.replace(`/auth/sign-in`);
    }
    return <Spinner message="Redirecting" />;
  }

  if (
    session.status === "authenticated" &&
    unauthenticatedPaths.includes(router.pathname)
  ) {
    const queryTargetPath = router.query.targetPath as string | undefined;

    const sanitizedTargetPath = queryTargetPath
      ? DOMPurify.sanitize(queryTargetPath)
      : undefined;

    // only allow relative links
    const targetPath =
      sanitizedTargetPath?.startsWith("/") &&
      !sanitizedTargetPath.startsWith("//")
        ? sanitizedTargetPath
        : "/";

    void router.replace(targetPath);
    return <Spinner message="Redirecting" />;
  }

  const hideNavigation =
    session.status === "unauthenticated" ||
    pathsWithoutNavigation.includes(router.pathname) ||
    router.pathname.startsWith("/public/");
  if (hideNavigation)
    return (
      <SidebarProvider>
        <main className="h-dvh w-full bg-primary-foreground p-3 px-4 py-4 sm:px-6 lg:px-8">
          {props.children}
        </main>
      </SidebarProvider>
    );
  return (
    <>
      <Head>
        <title>
          {activePathName ? `${activePathName} | Langfuse` : "Langfuse"}
        </title>
        <link
          rel="apple-touch-icon"
          sizes="180x180"
          href={`${env.NEXT_PUBLIC_BASE_PATH ?? ""}/apple-touch-icon.png`}
        />
        <link
          rel="icon"
          type="image/png"
          sizes="32x32"
          href={`${env.NEXT_PUBLIC_BASE_PATH ?? ""}/favicon-32x32${region === "DEV" ? "-dev" : ""}.png`}
        />
        <link
          rel="icon"
          type="image/png"
          sizes="16x16"
          href={`${env.NEXT_PUBLIC_BASE_PATH ?? ""}/favicon-16x16${region === "DEV" ? "-dev" : ""}.png`}
        />
      </Head>
      <PaymentBannerProvider>
        <SidebarProvider>
          <div className="flex h-dvh w-full flex-col">
            <PaymentBanner />
            <div className="flex min-h-0 flex-1 pt-banner-offset">
              <AppSidebar
                navItems={mainNavigation}
                secondaryNavItems={secondaryNavigation}
                userNavProps={{
                  items: getUserNavigation(),
                  user: {
                    name: session.data?.user?.name ?? "",
                    email: session.data?.user?.email ?? "",
                    avatar: session.data?.user?.image ?? "",
                  },
                }}
              />
              <SidebarInset className="h-screen-with-banner max-w-full md:peer-data-[state=collapsed]:w-[calc(100vw-var(--sidebar-width-icon))] md:peer-data-[state=expanded]:w-[calc(100vw-var(--sidebar-width))]">
                <ResizableContent>{props.children}</ResizableContent>
                <Toaster visibleToasts={1} />
                <CommandMenu mainNavigation={navigation} />
              </SidebarInset>
            </div>
          </div>
        </SidebarProvider>
      </PaymentBannerProvider>
    </>
  );
}

/** Resizable content for support drawer on the right side of the screen (desktop).
 *  On mobile, renders a Drawer instead of a resizable sidebar.
 */
export function ResizableContent({ children }: PropsWithChildren) {
  const { open, setOpen } = useSupportDrawer();
  const isDesktop = useMediaQuery({ query: "(min-width: 768px)" });

  if (!isDesktop) {
    return (
      <>
        <main className="h-full flex-1">{children}</main>

        <Drawer open={open} onOpenChange={setOpen} forceDirection="bottom">
          <DrawerContent
            id="support-drawer"
            className="inset-x-0 bottom-0 top-[calc(var(--banner-offset)+10px)] min-h-screen-with-banner"
            size="full"
          >
            <DrawerHeader className="absolute inset-x-0 top-0 p-0 text-left">
              <div className="flex w-full items-center justify-center pt-3">
                <div className="h-2 w-20 rounded-full bg-muted" />
              </div>
              {/* sr-only for screen readers and accessibility */}
              <DrawerTitle className="sr-only">Support</DrawerTitle>
              <DrawerDescription className="sr-only">
                A list of resources and options to help you with your questions.
              </DrawerDescription>
            </DrawerHeader>
            <div className="mt-4 max-h-full">
              <SupportDrawer showCloseButton={false} className="h-full pb-20" />
            </div>
          </DrawerContent>
        </Drawer>
      </>
    );
  }

  // 👉 DESKTOP: if drawer isn't open, render only the main content (like before)
  if (isDesktop && !open) {
    return <main className="h-full flex-1">{children}</main>;
  }

  const mainDefault = 70;
  const drawerDefault = 30;

  return (
    <ResizablePanelGroup direction="horizontal" className="flex h-full w-full">
      <ResizablePanel defaultSize={mainDefault} minSize={30}>
        <main className="relative h-full w-full overflow-scroll">
          {children}
        </main>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={drawerDefault} minSize={20} maxSize={60}>
        <SupportDrawer />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
