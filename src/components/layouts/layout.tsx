import { Fragment, type PropsWithChildren, useState } from "react";
import { Dialog, Menu, Transition } from "@headlessui/react";
import {
  Bars3Icon,
  Cog6ToothIcon,
  DocumentDuplicateIcon,
  HomeIcon,
  UsersIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

import Link from "next/link";
import { useRouter } from "next/router";
import clsx from "clsx";
import { Code, LineChart } from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { ChevronDownIcon } from "@heroicons/react/20/solid";
import { cn } from "@/src/utils/tailwind";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/src/components/ui/avatar";
import { api } from "@/src/utils/api";
import { NewProjectButton } from "@/src/features/projects/components/NewProjectButton";

const userNavigation = [
  {
    name: "Sign out",
    onClick: () =>
      signOut({
        callbackUrl: "/auth/sign-in",
      }),
  },
];

const pathsWithoutNavigation: string[] = [];
const unauthenticatedPaths = ["/auth/sign-in", "/auth/sign-up"];

export default function Layout(props: PropsWithChildren) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const router = useRouter();
  const projectId = router.query.projectId as string | undefined;
  const navigation = [
    { name: "Dashboard", pathname: `/project/[projectId]`, icon: HomeIcon },
    {
      name: "Traces",
      pathname: `/project/[projectId]/traces`,
      icon: UsersIcon,
    },
    {
      name: "LLM Calls",
      pathname: `/project/[projectId]/llm-calls`,
      icon: DocumentDuplicateIcon,
    },
    {
      name: "Scores",
      pathname: `/project/[projectId]/scores`,
      icon: LineChart,
    },
    {
      name: "Setup",
      pathname: "/project/[projectId]/setup",
      icon: Cog6ToothIcon,
    },
  ]
    .filter((nav) => projectId || !nav.pathname.includes("[projectId]"))
    .map((nav) => ({
      ...nav,
      href: nav.pathname.replace("[projectId]", projectId ?? ""),
    }))
    .map((staticAttributes) => ({
      ...staticAttributes,
      current: router.pathname === staticAttributes.pathname,
    }));

  console.log(router.pathname);

  const session = useSession();

  const projects = api.projects.all.useQuery(undefined, {
    enabled: session.status === "authenticated",
  });

  if (session.status === "loading") return <Spinner message="Loading" />;

  // If the user has a token, but does not exist in the database, sign them out
  if (
    session.data &&
    session.data.user === null &&
    !unauthenticatedPaths.includes(router.pathname)
  ) {
    void signOut({
      callbackUrl: "/auth/sign-in",
    });
    return <Spinner message="Redirecting" />;
  }

  if (
    session.status === "unauthenticated" &&
    !unauthenticatedPaths.includes(router.pathname)
  ) {
    void router.push("/auth/sign-in");
    return <Spinner message="Redirecting" />;
  }

  if (
    session.status === "authenticated" &&
    unauthenticatedPaths.includes(router.pathname)
  ) {
    void router.push("/");
    return <Spinner message="Redirecting" />;
  }

  const hideNavigation =
    session.status === "unauthenticated" ||
    projects.data?.length === 0 ||
    pathsWithoutNavigation.includes(router.pathname);
  if (hideNavigation)
    return (
      <main className="h-full bg-gray-50 px-4 py-4 sm:px-6 lg:px-8">
        {props.children}
      </main>
    );

  return (
    <>
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
                  <div className="flex grow flex-col gap-y-5 overflow-y-auto bg-white px-6 pb-4">
                    <div className="flex h-16 shrink-0 items-center font-mono text-xl font-bold">
                      🪢 langfuse
                    </div>
                    <nav className="flex flex-1 flex-col">
                      <ul role="list" className="flex flex-1 flex-col gap-y-7">
                        <li>
                          <ul role="list" className="-mx-2 space-y-1">
                            {navigation.map((item) => (
                              <li key={item.name}>
                                <Link
                                  href={item.href}
                                  className={clsx(
                                    item.current
                                      ? "bg-gray-50 text-indigo-600"
                                      : "text-gray-700 hover:bg-gray-50 hover:text-indigo-600",
                                    "group flex gap-x-3 rounded-md p-2 text-sm font-semibold leading-6"
                                  )}
                                >
                                  <item.icon
                                    className={clsx(
                                      item.current
                                        ? "text-indigo-600"
                                        : "text-gray-400 group-hover:text-indigo-600",
                                      "h-6 w-6 shrink-0"
                                    )}
                                    aria-hidden="true"
                                  />
                                  {item.name}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </li>
                        <li>
                          <div className="flex flex-row place-content-between items-center">
                            <div className="text-xs font-semibold leading-6 text-gray-400">
                              Projects
                            </div>
                            <NewProjectButton size="xs" />
                          </div>
                          <ul role="list" className="-mx-2 mt-2 space-y-1">
                            {projects.data?.map((project) => (
                              <li key={project.name}>
                                <Link
                                  href={`/project/${project.id}`}
                                  className={cn(
                                    projectId === project.id
                                      ? "bg-gray-50 text-indigo-600"
                                      : "text-gray-700 hover:bg-gray-50 hover:text-indigo-600",
                                    "group flex gap-x-3 rounded-md p-2 text-sm font-semibold leading-6"
                                  )}
                                >
                                  <span
                                    className={cn(
                                      projectId === project.id
                                        ? "border-indigo-600 text-indigo-600"
                                        : "border-gray-200 text-gray-400 group-hover:border-indigo-600 group-hover:text-indigo-600",
                                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border bg-white p-1 text-[0.625rem] font-medium"
                                    )}
                                  >
                                    <Code />
                                  </span>
                                  <span className="truncate">
                                    {project.name}
                                  </span>
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
        <div className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-72 lg:flex-col">
          {/* Sidebar component, swap this element with another sidebar if you like */}
          <div className="flex grow flex-col gap-y-5 overflow-y-auto border-r border-gray-200 bg-white px-6">
            <div className="flex h-16 shrink-0 items-center font-mono text-xl font-bold">
              🪢 langfuse
            </div>
            <nav className="flex flex-1 flex-col">
              <ul role="list" className="flex flex-1 flex-col gap-y-4">
                <li>
                  <ul role="list" className="-mx-2 space-y-1">
                    {navigation.map((item) => (
                      <li key={item.name}>
                        <Link
                          href={item.href}
                          className={clsx(
                            item.current
                              ? "bg-gray-50 text-indigo-600"
                              : "text-gray-700 hover:bg-gray-50 hover:text-indigo-600",
                            "group flex gap-x-3 rounded-md p-2 text-sm font-semibold leading-6"
                          )}
                        >
                          <item.icon
                            className={clsx(
                              item.current
                                ? "text-indigo-600"
                                : "text-gray-400 group-hover:text-indigo-600",
                              "h-6 w-6 shrink-0"
                            )}
                            aria-hidden="true"
                          />
                          {item.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </li>

                <li className="mt-auto">
                  <div className="flex flex-row place-content-between items-center">
                    <div className="text-xs font-semibold leading-6 text-gray-400">
                      Projects
                    </div>
                    <NewProjectButton size="xs" />
                  </div>
                  <ul role="list" className="-mx-2 mt-2 space-y-1">
                    {projects.data?.map((project) => (
                      <li key={project.name}>
                        <Link
                          href={`/project/${project.id}`}
                          className={cn(
                            projectId === project.id
                              ? "bg-gray-50 text-indigo-600"
                              : "text-gray-700 hover:bg-gray-50 hover:text-indigo-600",
                            "group flex gap-x-3 rounded-md p-2 text-sm font-semibold leading-6"
                          )}
                        >
                          <span
                            className={cn(
                              projectId === project.id
                                ? "border-indigo-600 text-indigo-600"
                                : "border-gray-200 text-gray-400 group-hover:border-indigo-600 group-hover:text-indigo-600",
                              "w-6shrink-0 flex h-6 w-6 items-center justify-center rounded-lg border bg-white p-1 text-[0.625rem] font-medium"
                            )}
                          >
                            <Code />
                          </span>
                          <span className="truncate">{project.name}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </li>

                <li className="-mx-6 ">
                  <Menu as="div" className="relative">
                    <Menu.Button className="flex w-full items-center gap-x-4 p-1.5 px-6 py-3 text-sm font-semibold leading-6 text-gray-900 hover:bg-gray-50">
                      <span className="sr-only">Open user menu</span>
                      <Avatar className="h-8 w-8">
                        <AvatarImage
                          src={session.data?.user.image ?? undefined}
                        />
                        <AvatarFallback>
                          {session.data?.user.name
                            ? session.data.user.name
                                .split(" ")
                                .map((word) => word[0])
                                .slice(0, 2)
                                .concat("")
                            : null}
                        </AvatarFallback>
                      </Avatar>
                      <span className="flex-shrink truncate text-sm font-semibold leading-6 text-gray-900">
                        {session.data?.user.name}
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
                                  "block px-3 py-1 text-sm leading-6 text-gray-900"
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
                </li>
              </ul>
            </nav>
          </div>
        </div>

        <div className="sticky top-0 z-40 flex items-center gap-x-6 bg-white px-4 py-4 shadow-sm sm:px-6 lg:hidden">
          <button
            type="button"
            className="-m-2.5 p-2.5 text-gray-700 lg:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <span className="sr-only">Open sidebar</span>
            <Bars3Icon className="h-6 w-6" aria-hidden="true" />
          </button>
          <div className="flex-1 font-mono text-sm font-bold leading-6 text-gray-900">
            🪢 langfuse
          </div>
          <Menu as="div" className="relative">
            <Menu.Button className="flex items-center gap-x-4 text-sm font-semibold leading-6 text-gray-900">
              <span className="sr-only">Open user menu</span>
              <Avatar className="h-8 w-8">
                <AvatarImage src={session.data?.user.image ?? undefined} />
                <AvatarFallback>
                  {session.data?.user.name
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
                          "block px-3 py-1 text-sm leading-6 text-gray-900"
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
        <div className="lg:pl-72">
          <main className="py-4">
            <div className="px-4 sm:px-6 lg:px-8">{props.children}</div>
          </main>
        </div>
      </div>
    </>
  );
}

function Spinner(props: { message: string }) {
  return (
    <div className="flex min-h-full flex-1 flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <span className="block text-center font-mono text-4xl font-bold motion-safe:animate-spin">
          🪢
        </span>
        <h2 className="mt-4 text-center text-2xl font-bold leading-9 tracking-tight text-gray-900">
          {props.message} ...
        </h2>
      </div>
    </div>
  );
}
