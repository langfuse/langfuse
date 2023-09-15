import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/20/solid";
import Link from "next/link";

export default function Header(props: {
  title: string;
  breadcrumb?: { name: string; href?: string }[];
  live?: boolean;
  actionButtons?: React.ReactNode;
}) {
  const backHref =
    props.breadcrumb &&
    [...props.breadcrumb.map((i) => i.href).filter(Boolean)].pop();

  return (
    <div className="mb-8">
      <div>
        {backHref ? (
          <nav className="sm:hidden" aria-label="Back">
            <Link
              href={backHref}
              className="flex items-center text-sm font-medium text-gray-500 hover:text-gray-700"
            >
              <ChevronLeftIcon
                className="-ml-1 mr-1 h-5 w-5 flex-shrink-0 text-gray-400"
                aria-hidden="true"
              />
              Back
            </Link>
          </nav>
        ) : null}
        {props.breadcrumb ? (
          <nav className="hidden sm:flex" aria-label="Breadcrumb">
            <ol role="list" className="flex items-center space-x-4">
              {props.breadcrumb.map(({ name, href }, index) => (
                <li key={index}>
                  <div className="flex items-center">
                    {index !== 0 && (
                      <ChevronRightIcon
                        className="mr-4 h-5 w-5 flex-shrink-0 text-gray-400"
                        aria-hidden="true"
                      />
                    )}
                    {href ? (
                      <Link
                        href={href}
                        className="text-sm font-medium text-gray-500 hover:text-gray-700"
                      >
                        {name}
                      </Link>
                    ) : (
                      <div className="text-sm font-medium text-gray-500">
                        {name}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </nav>
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-5">
        <div className="flex items-center gap-3 md:gap-5">
          <div className="min-w-0">
            <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight">
              {props.title}
            </h2>
          </div>
          {props.live ? (
            <div className="flex items-center gap-2 rounded-sm bg-green-100 px-3  text-green-600">
              <span className="relative flex h-2 w-2 ">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-green-600"></span>
              </span>
              Live
            </div>
          ) : null}
        </div>
        <div className="md:flex-1" />
        {props.actionButtons ?? null}
      </div>
    </div>
  );
}
