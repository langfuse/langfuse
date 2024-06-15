import { ROUTES, type Route } from "@/src/components/layouts/routes";
import { Fragment, type PropsWithChildren, useState } from "react";
import { Dialog, Disclosure, Menu, Transition } from "@headlessui/react";
import { Bars3Icon, XMarkIcon } from "@heroicons/react/24/outline";

import Link from "next/link";
import { useRouter } from "next/router";
import clsx from "clsx";
import { MessageSquarePlus, Info, ChevronRightIcon } from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { cn } from "@/src/utils/tailwind";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/src/components/ui/avatar";
import { NewProjectButton } from "@/src/features/projects/components/NewProjectButton";
import { FeedbackButtonWrapper } from "@/src/features/feedback/component/FeedbackButton";
import { Button } from "@/src/components/ui/button";
import Head from "next/head";
import { env } from "@/src/env.mjs";
import { LangfuseLogo } from "@/src/components/LangfuseLogo";
import { Spinner } from "@/src/components/layouts/spinner";
import { hasAccess } from "@/src/features/rbac/utils/checkAccess";
import { Toaster } from "@/src/components/ui/sonner";
import {
  NOTIFICATIONS,
  useCheckNotification,
} from "@/src/features/notifications/checkNotifications";
import { ChevronDownIcon } from "@heroicons/react/20/solid";
import useLocalStorage from "@/src/components/useLocalStorage";
import { ProjectNavigation } from "@/src/components/projectNavigation";
import DOMPurify from "dompurify";
import { ThemeToggle } from "@/src/features/theming/ThemeToggle";
import { useIsEeEnabled } from "@/src/ee/utils/useIsEeEnabled";

const signOutUser = async () => {
  localStorage.clear();
  sessionStorage.clear();

  await signOut({
    callbackUrl: "/auth/sign-in",
  });
};

const userNavigation = [
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

const pathsWithoutNavigation: string[] = [
  "/onboarding",
  "/auth/reset-password",
];
const unauthenticatedPaths: string[] = [
  "/auth/sign-in",
  "/auth/sign-up",
  "/auth/error",
];
// auth or unauthed
const publishablePaths: string[] = [
  "/project/[projectId]/sessions/[sessionId]",
  "/project/[projectId]/traces/[traceId]",
  "/auth/reset-password",
];

export default function Layout(props: PropsWithChildren) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const router = useRouter();
  const session = useSession();

  useCheckNotification(NOTIFICATIONS, session.status === "authenticated");

  const enableExperimentalFeatures =
    session.data?.environment.enableExperimentalFeatures ?? false;

  const projectId = router.query.projectId as string | undefined;
  const isEeEnabled = useIsEeEnabled();

  const mapNavigation = (route: Route): NavigationItem | null => {
    // Project-level routes
    if (!projectId && route.pathname?.includes("[projectId]")) return null;

    // Feature Flags
    if (
      !(
        route.featureFlag === undefined ||
        enableExperimentalFeatures ||
        session.data?.user?.featureFlags[route.featureFlag]
      )
    )
      return null;

    // check ee or cloud requirements
    if (
      route.requires !== undefined &&
      !(
        (route.requires === "cloud" &&
          Boolean(env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION)) ||
        (route.requires === "cloud-or-ee" && isEeEnabled)
      )
    )
      return null;

    // RBAC
    if (
      route.rbacScope !== undefined &&
      (!projectId ||
        !hasAccess({
          projectId,
          scope: route.rbacScope,
          session: session.data,
        }))
    )
      return null;

    // apply to children as well
    const children: (NavigationItem | null)[] =
      route.children?.map((child) => mapNavigation(child)).filter(Boolean) ??
      [];
    return {
      ...route,
      href: route.pathname?.replace("[projectId]", projectId ?? ""),
      current: router.pathname === route.pathname,
      children:
        children.length > 0
          ? (children as NavigationItem[]) // does not include null due to filter
          : undefined,
    };
  };

  const navigationMapped: (NavigationItem | null)[] = ROUTES.map((route) =>
    mapNavigation(route),
  ).filter(Boolean);
  const navigation = navigationMapped.filter(Boolean) as NavigationItem[]; // does not include null due to filter
  const topNavigation = navigation.filter(({ bottom }) => !bottom);
  const bottomNavigation = navigation.filter(({ bottom }) => bottom);

  const currentPathName = navigation.find(({ current }) => current)?.name;

  const projects = session.data?.user?.projects ?? [];

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
    const targetPath = router.query.targetPath as string | undefined;

    const sanitizedTargetPath = targetPath
      ? DOMPurify.sanitize(targetPath)
      : undefined;

    void router.replace(sanitizedTargetPath ?? "/");
    return <Spinner message="Redirecting" />;
  }

  const hideNavigation =
    session.status === "unauthenticated" ||
    pathsWithoutNavigation.includes(router.pathname) ||
    router.pathname.startsWith("/public/");
  if (hideNavigation)
    return (
      <main className="min-h-screen bg-primary-foreground px-4 py-4 sm:px-6 lg:px-8">
        {props.children}
      </main>
    );
  return (
    <>
      <Head>
        <title>
          {currentPathName ? `${currentPathName} | Langfuse` : "Langfuse"}
        </title>
        <link
          rel="apple-touch-icon"
          sizes="180x180"
          href="/apple-touch-icon.png"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="32x32"
          href="/favicon-32x32.png"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="16x16"
          href="/favicon-16x16.png"
        />
      </Head>
      <div>
        <Transition.Root show={sidebarOpen} as={Fragment}>
          <Dialog
            as="div"
            className="relative z-50 lg:hidden"
            onClose={setSidebarOpen}
          >
            <Transition.Child
              as={Fragment}
              enter="transition-opacity ease-linear duration-300"
              enterFrom="opacity-0"
              enterTo="opacity-100"
              leave="transition-opacity ease-linear duration-300"
              leaveFrom="opacity-100"
              leaveTo="opacity-0"
            >
              <div className="fixed inset-0 bg-primary/80" />
            </Transition.Child>

            <div className="fixed inset-0 flex">
              <Transition.Child
                as={Fragment}
                enter="transition ease-in-out duration-300 transform"
                enterFrom="-translate-x-full"
                enterTo="translate-x-0"
                leave="transition ease-in-out duration-300 transform"
                leaveFrom="translate-x-0"
                leaveTo="-translate-x-full"
              >
                <Dialog.Panel className="relative mr-16 flex w-full max-w-60 flex-1">
                  <Transition.Child
                    as={Fragment}
                    enter="ease-in-out duration-300"
                    enterFrom="opacity-0"
                    enterTo="opacity-100"
                    leave="ease-in-out duration-300"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                  >
                    <div className="absolute left-full top-0 flex w-16 justify-center pt-5">
                      <button
                        type="button"
                        className="-m-2.5 p-2.5"
                        onClick={() => setSidebarOpen(false)}
                      >
                        <span className="sr-only">Close sidebar</span>
                        <XMarkIcon
                          className="h-5 w-5 text-background"
                          aria-hidden="true"
                        />
                      </button>
                    </div>
                  </Transition.Child>
                  {/* Sidebar component, swap this element with another sidebar if you like */}
                  <div className="flex grow flex-col gap-y-5 overflow-y-auto bg-background px-6 py-4">
                    <LangfuseLogo
                      version
                      size="xl"
                      showEnvLabel={session.data?.user?.email?.endsWith(
                        "@langfuse.com",
                      )}
                    />
                    <nav className="flex flex-1 flex-col">
                      <ul role="list">
                        <MainNavigation nav={navigation} />
                      </ul>
                      <div className="mb-2 flex flex-row place-content-between items-center">
                        <div className="text-xs font-semibold text-muted-foreground">
                          Project
                        </div>
                        <NewProjectButton size="xs" />
                      </div>
                      <ProjectNavigation
                        currentProjectId={projectId ?? ""}
                        projects={projects}
                      />
                    </nav>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </Dialog>
        </Transition.Root>

        {/* Static sidebar for desktop */}
        <div className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-56 lg:flex-col">
          {/* Sidebar component, swap this element with another sidebar if you like */}
          <div className="flex h-screen grow flex-col border-r border-border bg-background pt-7">
            <LangfuseLogo
              version
              size="xl"
              className="mb-8 px-6"
              showEnvLabel={session.data?.user?.email?.endsWith(
                "@langfuse.com",
              )}
            />
            <nav className="flex h-full flex-1 flex-col overflow-y-auto px-6 pb-3">
              <ul role="list" className="flex h-full flex-col">
                <MainNavigation nav={topNavigation} />
                <MainNavigation nav={bottomNavigation} className="mt-auto" />
                <FeedbackButtonWrapper
                  className="space-y-1"
                  title="Provide feedback"
                  description="What do you think about this project? What can be improved?"
                  type="feedback"
                >
                  <li className="group -mx-2 my-1 flex cursor-pointer gap-x-3 rounded-md p-1.5 text-sm font-semibold text-primary hover:bg-primary-foreground hover:text-primary-accent">
                    <MessageSquarePlus
                      className="h-5 w-5 shrink-0 text-muted-foreground group-hover:text-primary-accent"
                      aria-hidden="true"
                    />
                    Feedback
                  </li>
                </FeedbackButtonWrapper>
                <div className="mb-2 flex flex-row place-content-between items-center">
                  <div className="text-xs font-semibold text-muted-foreground">
                    Project
                  </div>
                  <NewProjectButton size="xs" />
                </div>
                <ProjectNavigation
                  currentProjectId={projectId ?? ""}
                  projects={projects}
                />
              </ul>
            </nav>

            <Menu as="div" className="relative">
              <Menu.Button className="flex w-full items-center gap-x-2 overflow-hidden p-1.5 py-3 pl-6 pr-8 text-sm font-semibold text-primary hover:bg-primary-foreground">
                <span className="sr-only">Open user menu</span>
                <Avatar className="h-7 w-7">
                  <AvatarImage src={session.data?.user?.image ?? undefined} />
                  <AvatarFallback>
                    {session.data?.user?.name
                      ? session.data.user.name
                          .split(" ")
                          .map((word) => word[0])
                          .slice(0, 2)
                          .concat("")
                      : null}
                  </AvatarFallback>
                </Avatar>
                <span className="flex-shrink truncate text-sm font-semibold text-primary">
                  {session.data?.user?.name}
                </span>
                <div className="flex-1" />
                <ChevronDownIcon
                  className="h-5 w-5 text-muted-foreground"
                  aria-hidden="true"
                />
              </Menu.Button>
              <Transition
                as={Fragment}
                enter="transition ease-out duration-100"
                enterFrom="transform opacity-0 scale-95"
                enterTo="transform opacity-100 scale-100"
                leave="transition ease-in duration-75"
                leaveFrom="transform opacity-100 scale-100"
                leaveTo="transform opacity-0 scale-95"
              >
                <Menu.Items className="absolute -top-full bottom-1 right-0 z-10 overflow-hidden rounded-md bg-background py-2 shadow-lg ring-1 ring-border focus:outline-none">
                  <span className="block border-b px-3 pb-2 text-sm leading-6 text-muted-foreground">
                    {session.data?.user?.email}
                  </span>
                  {userNavigation.map((item) => (
                    <Menu.Item key={item.name}>
                      {({ active }) => (
                        <a
                          onClick={() => void item.onClick()}
                          className={cn(
                            active ? "bg-primary-foreground" : "",
                            "flex cursor-pointer items-center justify-between px-2 py-0.5 text-sm leading-6 text-primary",
                          )}
                        >
                          {item.name}
                          {item.content}
                        </a>
                      )}
                    </Menu.Item>
                  ))}
                </Menu.Items>
              </Transition>
            </Menu>
          </div>
        </div>

        <div className="sticky top-0 z-40 flex items-center gap-x-6 bg-background px-4 py-4 shadow-sm sm:px-6 lg:hidden">
          <button
            type="button"
            className="-m-2.5 p-2.5 text-primary lg:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <span className="sr-only">Open sidebar</span>
            <Bars3Icon className="h-5 w-5" aria-hidden="true" />
          </button>
          <LangfuseLogo
            version
            className="flex-1"
            showEnvLabel={session.data?.user?.email?.endsWith("@langfuse.com")}
          />
          <Menu as="div" className="relative">
            <Menu.Button className="flex items-center gap-x-4 text-sm font-semibold text-primary">
              <span className="sr-only">Open user menu</span>
              <Avatar className="h-8 w-8">
                <AvatarImage src={session.data?.user?.image ?? undefined} />
                <AvatarFallback>
                  {session.data?.user?.name
                    ? session.data.user.name
                        .split(" ")
                        .map((word) => word[0])
                        .slice(0, 2)
                        .concat("")
                    : null}
                </AvatarFallback>
              </Avatar>
            </Menu.Button>
            <Transition
              as={Fragment}
              enter="transition ease-out duration-100"
              enterFrom="transform opacity-0 scale-95"
              enterTo="transform opacity-100 scale-100"
              leave="transition ease-in duration-75"
              leaveFrom="transform opacity-100 scale-100"
              leaveTo="transform opacity-0 scale-95"
            >
              <Menu.Items className="absolute right-0 z-10 mt-2.5 rounded-md bg-background py-2 pb-1 shadow-lg ring-1 ring-border focus:outline-none">
                <span className="mb-1 block border-b px-3 pb-2 text-sm leading-6 text-muted-foreground">
                  {session.data?.user?.email}
                </span>
                {userNavigation.map((item) => (
                  <Menu.Item key={item.name}>
                    {({ active }) => (
                      <a
                        onClick={() => void item.onClick()}
                        className={cn(
                          active ? "bg-primary-foreground" : "",
                          "flex cursor-pointer items-center justify-between px-2 py-1 text-sm leading-6 text-primary",
                        )}
                      >
                        {item.name}
                        {item.content}
                      </a>
                    )}
                  </Menu.Item>
                ))}
              </Menu.Items>
            </Transition>
          </Menu>
        </div>
        <div className="lg:pl-56">
          {env.NEXT_PUBLIC_DEMO_PROJECT_ID &&
          projectId === env.NEXT_PUBLIC_DEMO_PROJECT_ID &&
          (env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === "STAGING" ||
            env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === "EU") &&
          !session.data?.user?.email?.endsWith("@langfuse.com") ? (
            <div className="flex w-full items-center border-b border-dark-yellow  bg-light-yellow px-4 py-2 lg:sticky lg:top-0 lg:z-40">
              <div className="flex flex-1 flex-wrap gap-1">
                <div className="flex items-center gap-1">
                  <Info className="h-4 w-4" />
                  <span className="font-semibold">DEMO (view-only)</span>
                </div>
                <div>Use demo RAG chat to see live data in this project.</div>
              </div>

              <Button size="sm" asChild className="ml-2">
                <Link
                  href={
                    env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === "EU"
                      ? "https://langfuse.com/docs/demo"
                      : "https://docs-staging.langfuse.com/docs/demo" // staging
                  }
                  target="_blank"
                >
                  {
                    env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === "EU"
                      ? "Use Chat ↗"
                      : "Use Chat (staging) ↗" // staging
                  }
                </Link>
              </Button>
            </div>
          ) : null}
          <main className="p-4">{props.children}</main>
          <Toaster visibleToasts={1} />
        </div>
      </div>
    </>
  );
}

type NavigationItem = NestedNavigationItem & {
  children?: NestedNavigationItem[];
};

type NestedNavigationItem = Omit<Route, "children"> & {
  href?: string;
  current: boolean;
};

const MainNavigation: React.FC<{
  nav: NavigationItem[];
  onNavitemClick?: () => void;
  className?: string;
}> = ({ nav, onNavitemClick, className }) => {
  const [isOpen, setIsOpen] = useLocalStorage<Record<string, boolean>>(
    "sidebar-item-default-open",
    {},
  );

  return (
    <li className={className}>
      <ul role="list" className="-mx-2 space-y-1">
        {nav.map((item) => (
          <li key={item.name}>
            {(!item.children || item.children.length === 0) && item.href ? (
              <Link
                href={item.href}
                className={clsx(
                  item.current
                    ? "bg-primary-foreground text-primary-accent"
                    : "text-primary hover:bg-primary-foreground hover:text-primary-accent",
                  "group flex gap-x-3 rounded-md p-2 text-sm font-semibold",
                )}
                onClick={onNavitemClick}
                target={item.newTab ? "_blank" : undefined}
              >
                {item.icon && (
                  <item.icon
                    className={clsx(
                      item.current
                        ? "text-primary-accent"
                        : "text-muted-foreground group-hover:text-primary-accent",
                      "h-5 w-5 shrink-0",
                    )}
                    aria-hidden="true"
                  />
                )}
                {item.name}
                {item.label && (
                  <span
                    className={cn(
                      "-my-0.5 self-center whitespace-nowrap break-keep rounded-sm border px-1 py-0.5 text-xs",
                      item.current
                        ? "border-primary-accent text-primary-accent"
                        : "border-border text-muted-foreground group-hover:border-primary-accent group-hover:text-primary-accent",
                    )}
                  >
                    {item.label}
                  </span>
                )}
              </Link>
            ) : item.children && item.children.length > 0 ? (
              <Disclosure
                as="div"
                defaultOpen={
                  item.children.some((child) => child.current) ||
                  isOpen[item.name]
                }
              >
                {({ open }) => (
                  <>
                    <Disclosure.Button
                      className="group flex w-full items-center gap-x-3 rounded-md p-2 text-left text-sm font-semibold hover:bg-primary-foreground hover:text-primary-accent"
                      onClick={() =>
                        setIsOpen((prev) => ({
                          ...prev,
                          [item.name]: !prev[item.name],
                        }))
                      }
                    >
                      {item.icon && (
                        <item.icon
                          className="h-5 w-5 shrink-0 text-muted-foreground group-hover:text-primary-accent"
                          aria-hidden="true"
                        />
                      )}
                      {item.name}
                      {item.label && (
                        <span
                          className={cn(
                            "-my-0.5 self-center whitespace-nowrap break-keep rounded-sm border px-1 py-0.5 text-xs",
                            item.current
                              ? "border-primary-accent text-primary-accent"
                              : "border-border text-muted-foreground group-hover:border-primary-accent group-hover:text-primary-accent",
                          )}
                        >
                          {item.label}
                        </span>
                      )}
                      <ChevronRightIcon
                        className={clsx(
                          open
                            ? "rotate-90 text-muted-foreground"
                            : "text-muted-foreground",
                          "ml-auto h-5 w-5 shrink-0",
                        )}
                        aria-hidden="true"
                      />
                    </Disclosure.Button>
                    <Disclosure.Panel as="ul" className="mt-1 space-y-1 px-2">
                      {item.children?.map((subItem) => (
                        <li key={subItem.name}>
                          {/* 44px */}
                          <Link
                            href={subItem.href ?? "#"}
                            className={clsx(
                              subItem.current
                                ? "bg-primary-foreground text-primary-accent"
                                : "text-primary hover:bg-primary-foreground hover:text-primary-accent",
                              "ml-0.5 flex w-full items-center gap-x-3 rounded-md p-1.5 pl-7 pr-2 text-sm",
                            )}
                            target={subItem.newTab ? "_blank" : undefined}
                          >
                            {subItem.name}
                            {subItem.label && (
                              <span className="self-center whitespace-nowrap break-keep rounded-sm border border-border px-1 py-0.5 text-xs text-muted-foreground group-hover:border-primary-accent group-hover:text-primary-accent">
                                {subItem.label}
                              </span>
                            )}
                          </Link>
                        </li>
                      ))}
                    </Disclosure.Panel>
                  </>
                )}
              </Disclosure>
            ) : null}
          </li>
        ))}
      </ul>
    </li>
  );
};
