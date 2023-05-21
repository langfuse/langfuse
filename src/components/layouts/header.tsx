import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/20/solid";
import Link from "next/link";

export default function Header(props: {
  title: string;
  breadcrumb?: { name: string; href?: string }[];
}) {
  const backHref =
    props.breadcrumb &&
    [...props.breadcrumb.map((i) => i.href).filter(Boolean)].pop();

  return (
    <div className="mb-5">
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
                <li key={href}>
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
      <div className="mt-2 md:flex md:items-center md:justify-between">
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight">
            {props.title}
          </h2>
        </div>
        {/* <div className="mt-4 flex flex-shrink-0 md:ml-4 md:mt-0">
          <button
            type="button"
            className="inline-flex items-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
          >
            Edit
          </button>
          <button
            type="button"
            className="ml-3 inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          >
            Publish
          </button>
        </div> */}
      </div>
    </div>
  );
}
