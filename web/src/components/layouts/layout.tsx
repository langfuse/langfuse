import { ROUTES, type Route } from "@/src/components/layouts/routes";
import { Fragment, type PropsWithChildren, useState } from "react";
import { Dialog, Disclosure, Menu, Transition } from "@headlessui/react";
import { Bars3Icon, XMarkIcon } from "@heroicons/react/24/outline";

import Link from "next/link";
import { useRouter } from "next/router";
import clsx from "clsx";
import { Code, MessageSquarePlus, Info, ChevronRightIcon } from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { cn } from "@/src/utils/tailwind";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/src/components/ui/avatar";
import { api } from "@/src/utils/api";
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

const userNavigation = [
  {
    name: "Sign out",
    onClick: () =>
      signOut({
        callbackUrl: "/auth/sign-in",
      }),
  },
];

const pathsWithoutNavigation: string[] = ["/onboarding"];
const unauthenticatedPaths: string[] = ["/auth/sign-in", "/auth/sign-up"];
const publishablePaths: string[] = [
  "/project/[projectId]/sessions/[sessionId]",
  "/project/[projectId]/traces/[traceId]",
];

export default function Layout(props: PropsWithChildren) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const router = useRouter();
  const session = useSession();

  useCheckNotification(NOTIFICATIONS, session.status === "authenticated");

  const enableExperimentalFeatures =
    api.environment.enableExperimentalFeatures.useQuery().data ?? false;

  const projectId = router.query.projectId as string | undefined;

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
    void signOut({
      callbackUrl: "/auth/sign-in",
    });
    return <Spinner message="Redirecting" />;
  }

  if (
    session.status === "unauthenticated" &&
    !unauthenticatedPaths.includes(router.pathname) &&
    !publishablePaths.includes(router.pathname) &&
    !router.pathname.startsWith("/public/")
  ) {
    void router.replace("/auth/sign-in");
    return <Spinner message="Redirecting" />;
  }

  if (
    session.status === "authenticated" &&
    unauthenticatedPaths.includes(router.pathname)
  ) {
    void router.replace("/");
    return <Spinner message="Redirecting" />;
  }

  const hideNavigation =
    session.status === "unauthenticated" ||
    projects.length === 0 ||
    pathsWithoutNavigation.includes(router.pathname) ||
    router.pathname.startsWith("/public/");
  if (hideNavigation)
    return (
      <main className="min-h-screen bg-gray-50 px-4 py-4 sm:px-6 lg:px-8">
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
            className="relative z-50 xl:hidden"
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
              <div className="fixed inset-0 bg-gray-900/80" />
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
                <Dialog.Panel className="relative mr-16 flex w-full max-w-xs flex-1">
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
                          className="h-6 w-6 text-white"
                          aria-hidden="true"
                        />
                      </button>
                    </div>
                  </Transition.Child>
                  {/* Sidebar component, swap this element with another sidebar if you like */}
                  <div className="flex grow flex-col gap-y-5 overflow-y-auto bg-white px-6 py-4">
                    <LangfuseLogo
                      version
                      size="xl"
                      showEnvLabel={session.data?.user?.email?.endsWith(
                        "@langfuse.com",
                      )}
                    />
                    <nav className="flex flex-1 flex-col">
                      <ul role="list" className="flex flex-1 flex-col gap-y-7">
                        <MainNavigation nav={navigation} />
                        <li>
                          <div className="flex flex-row place-content-between items-center">
                            <div className="text-xs font-semibold leading-6 text-gray-400">
                              Projects
                            </div>
                            <NewProjectButton size="xs" />
                          </div>
                          <ul role="list" className="-mx-2 mt-2 space-y-1">
                            {projects.map((project) => (
                              <li key={project.name}>
                                <Link
                                  href={`/project/${project.id}`}
                                  className={cn(
                                    projectId === project.id
                                      ? "bg-gray-50 text-indigo-600"
                                      : "text-gray-700 hover:bg-gray-50 hover:text-indigo-600",
                                    "group flex gap-x-3 rounded-md p-2 text-sm font-semibold leading-6",
                                  )}
                                >
                                  <span
                                    className={cn(
                                      projectId === project.id
                                        ? "border-indigo-600 text-indigo-600"
                                        : "border-gray-200 text-gray-400 group-hover:border-indigo-600 group-hover:text-indigo-600",
                                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border bg-white p-1 text-[0.625rem] font-medium",
                                    )}
                                  >
                                    <Code />
                                  </span>
                                  <span className="truncate">
                                    {project.name}
                                  </span>
                                  {project.role === "VIEWER" ? (
                                    <span
                                      className={cn(
                                        "self-center whitespace-nowrap break-keep rounded-sm border px-1 py-0.5 text-xs",
                                        projectId === project.id
                                          ? "border-indigo-600 text-indigo-600"
                                          : "border-gray-200 text-gray-400 group-hover:border-indigo-600 group-hover:text-indigo-600",
                                      )}
                                    >
                                      view-only
                                    </span>
                                  ) : null}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </li>
                      </ul>
                    </nav>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </Dialog>
        </Transition.Root>

        {/* Static sidebar for desktop */}
        <div className="hidden xl:fixed xl:inset-y-0 xl:z-50 xl:flex xl:w-72 xl:flex-col">
          {/* Sidebar component, swap this element with another sidebar if you like */}
          <div className="flex h-screen grow flex-col gap-y-5 border-r border-gray-200 bg-white pt-7">
            <LangfuseLogo
              version
              size="xl"
              className="mb-2 px-6"
              showEnvLabel={session.data?.user?.email?.endsWith(
                "@langfuse.com",
              )}
            />
            <nav className="flex h-full flex-1 flex-col overflow-y-auto px-6 pb-3">
              <ul role="list" className="flex h-full flex-col gap-y-4">
                <MainNavigation nav={navigation} />
                <li className="mt-auto">
                  <div className="flex flex-row place-content-between items-center">
                    <div className="text-xs font-semibold leading-6 text-gray-400">
                      Projects
                    </div>
                    <NewProjectButton size="xs" />
                  </div>
                  <ul role="list" className="-mx-2 mt-2 space-y-1">
                    {projects.map((project, index) => (
                      <li key={project.name}>
                        <Link
                          href={`/project/${project.id}`}
                          className={cn(
                            projectId === project.id
                              ? "bg-gray-50 text-indigo-600"
                              : "text-gray-700 hover:bg-gray-50 hover:text-indigo-600",
                            "group flex gap-x-3 rounded-md p-2 text-sm font-semibold leading-6",
                          )}
                        >
                          <span
                            className={cn(
                              projectId === project.id
                                ? "border-indigo-600 text-indigo-600"
                                : "border-gray-200 text-gray-400 group-hover:border-indigo-600 group-hover:text-indigo-600",
                              "w-6shrink-0 flex h-6 w-6 items-center justify-center rounded-lg border bg-white p-1 text-[0.625rem] font-medium",
                            )}
                          >
                            <Code />
                          </span>
                          <span
                            className="truncate"
                            data-testid={`project-title-span-${index}`}
                          >
                            {project.name}
                          </span>
                          {project.role === "VIEWER" ? (
                            <span
                              className={cn(
                                "self-center whitespace-nowrap break-keep rounded-sm border px-1 py-0.5 text-xs",
                                projectId === project.id
                                  ? "border-indigo-600 text-indigo-600"
                                  : "border-gray-200 text-gray-400 group-hover:border-indigo-600 group-hover:text-indigo-600",
                              )}
                            >
                              view-only
                            </span>
                          ) : null}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </li>
              </ul>
            </nav>

            <Menu as="div" className="relative left-1">
              <Menu.Button className="flex w-full items-center gap-x-4 p-1.5 px-6 py-3 text-sm font-semibold leading-6 text-gray-900 hover:bg-gray-50">
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
                <span className="flex-shrink truncate text-sm font-semibold leading-6 text-gray-900">
                  {session.data?.user?.name}
                </span>
                <ChevronDownIcon
                  className="h-5 w-5 text-gray-400"
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
                <Menu.Items className="absolute -top-full right-0 z-10 mt-2.5 w-32 rounded-md bg-white py-2 shadow-lg ring-1 ring-gray-900/5 focus:outline-none">
                  {userNavigation.map((item) => (
                    <Menu.Item key={item.name}>
                      {({ active }) => (
                        <a
                          onClick={() => void item.onClick()}
                          className={cn(
                            active ? "bg-gray-50" : "",
                            "block cursor-pointer px-3 py-1 text-sm leading-6 text-gray-900",
                          )}
                        >
                          {item.name}
                        </a>
                      )}
                    </Menu.Item>
                  ))}
                </Menu.Items>
              </Transition>
            </Menu>
          </div>
        </div>

        <div className="sticky top-0 z-40 flex items-center gap-x-6 bg-white px-4 py-4 shadow-sm sm:px-6 xl:hidden">
          <button
            type="button"
            className="-m-2.5 p-2.5 text-gray-700 xl:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <span className="sr-only">Open sidebar</span>
            <Bars3Icon className="h-6 w-6" aria-hidden="true" />
          </button>
          <LangfuseLogo
            version
            className="flex-1"
            showEnvLabel={session.data?.user?.email?.endsWith("@langfuse.com")}
          />
          <Menu as="div" className="relative">
            <Menu.Button className="flex items-center gap-x-4 text-sm font-semibold leading-6 text-gray-900">
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
              <Menu.Items className="absolute right-0 z-10 mt-2.5 w-32 rounded-md bg-white py-2 shadow-lg ring-1 ring-gray-900/5 focus:outline-none">
                {userNavigation.map((item) => (
                  <Menu.Item key={item.name}>
                    {({ active }) => (
                      <a
                        onClick={() => void item.onClick()}
                        className={cn(
                          active ? "bg-gray-50" : "",
                          "block cursor-pointer px-3 py-1 text-sm leading-6 text-gray-900",
                        )}
                      >
                        {item.name}
                      </a>
                    )}
                  </Menu.Item>
                ))}
              </Menu.Items>
            </Transition>
          </Menu>
        </div>
        <div className="xl:pl-72">
          {env.NEXT_PUBLIC_DEMO_PROJECT_ID &&
          projectId === env.NEXT_PUBLIC_DEMO_PROJECT_ID &&
          (env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === "STAGING" ||
            env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === "EU") &&
          !session.data?.user?.email?.endsWith("@langfuse.com") ? (
            <div className="flex w-full items-center border-b border-yellow-500  bg-yellow-100 px-4 py-2 xl:sticky xl:top-0 xl:z-40">
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
                      : "https://docs-staging.langfuse.com/docs/demo"
                  }
                  target="_blank"
                >
                  {env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === "EU"
                    ? "Use Chat ↗"
                    : "Use Chat (staging) ↗"}
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
}> = ({ nav, onNavitemClick }) => {
  const [isOpen, setIsOpen] = useLocalStorage(
    "sidebar-tracing-default-open",
    false,
  );

  return (
    <li>
      <ul role="list" className="-mx-2 space-y-1">
        {nav.map((item) => (
          <li key={item.name}>
            {(!item.children || item.children.length === 0) && item.href ? (
              <Link
                href={item.href}
                className={clsx(
                  item.current
                    ? "bg-gray-50 text-indigo-600"
                    : "text-gray-700 hover:bg-gray-50 hover:text-indigo-600",
                  "group flex gap-x-3 rounded-md p-2 text-sm font-semibold leading-6",
                )}
                onClick={onNavitemClick}
              >
                {item.icon && (
                  <item.icon
                    className={clsx(
                      item.current
                        ? "text-indigo-600"
                        : "text-gray-400 group-hover:text-indigo-600",
                      "h-6 w-6 shrink-0",
                    )}
                    aria-hidden="true"
                  />
                )}
                {item.name}
                {item.label && (
                  <span
                    className={cn(
                      "self-center whitespace-nowrap break-keep rounded-sm border px-1 py-0.5 text-xs",
                      item.current
                        ? "border-indigo-600 text-indigo-600"
                        : "border-gray-200 text-gray-400 group-hover:border-indigo-600 group-hover:text-indigo-600",
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
                  item.children.some((child) => child.current) || isOpen
                }
              >
                {({ open }) => (
                  <>
                    <Disclosure.Button
                      className="group flex w-full items-center gap-x-3 rounded-md p-2 text-left text-sm font-semibold leading-6 hover:bg-gray-50 hover:text-indigo-600"
                      onClick={() => setIsOpen(!isOpen)}
                    >
                      {item.icon && (
                        <item.icon
                          className="h-6 w-6 shrink-0 text-gray-400 group-hover:text-indigo-600"
                          aria-hidden="true"
                        />
                      )}
                      {item.name}
                      {item.label && (
                        <span
                          className={cn(
                            "self-center whitespace-nowrap break-keep rounded-sm border px-1 py-0.5 text-xs",
                            item.current
                              ? "border-indigo-600 text-indigo-600"
                              : "border-gray-200 text-gray-400 group-hover:border-indigo-600 group-hover:text-indigo-600",
                          )}
                        >
                          {item.label}
                        </span>
                      )}
                      <ChevronRightIcon
                        className={clsx(
                          open ? "rotate-90 text-gray-500" : "text-gray-400",
                          "ml-auto h-5 w-5 shrink-0",
                        )}
                        aria-hidden="true"
                      />
                    </Disclosure.Button>
                    <Disclosure.Panel as="ul" className="mt-1 px-2">
                      {item.children?.map((subItem) => (
                        <li key={subItem.name}>
                          {/* 44px */}
                          <Link
                            href={subItem.href ?? "#"}
                            className={clsx(
                              subItem.current
                                ? "bg-gray-50 text-indigo-600"
                                : "text-gray-700 hover:bg-gray-50 hover:text-indigo-600",
                              "flex w-full items-center gap-x-3 rounded-md py-2 pl-9 pr-2 text-sm leading-6",
                            )}
                          >
                            {subItem.name}
                            {subItem.label && (
                              <span className="self-center whitespace-nowrap break-keep rounded-sm border border-gray-200 px-1 py-0.5 text-xs text-gray-400 group-hover:border-indigo-600 group-hover:text-indigo-600">
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
        <FeedbackButtonWrapper
          className="w-full"
          title="Provide feedback"
          description="What do you think about this project? What can be improved?"
          type="feedback"
        >
          <li className="group flex cursor-pointer gap-x-3 rounded-md p-2 text-sm font-semibold leading-6 text-gray-700 hover:bg-gray-50 hover:text-indigo-600">
            <MessageSquarePlus
              className="h-6 w-6 shrink-0 text-gray-400 group-hover:text-indigo-600"
              aria-hidden="true"
            />
            Feedback
          </li>
        </FeedbackButtonWrapper>
      </ul>
    </li>
  );
};
