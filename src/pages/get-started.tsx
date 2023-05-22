import { ChevronRightIcon } from "@heroicons/react/20/solid";
import { CommandLineIcon, MegaphoneIcon } from "@heroicons/react/24/outline";
import clsx from "clsx";
import { SiPython } from "react-icons/si";
import Header from "../components/layouts/header";

const items = [
  {
    name: "API",
    description: "Integrate with the langfuse REST API",
    href: "/api-doc",
    iconColor: "bg-purple-500",
    icon: MegaphoneIcon,
  },
  {
    name: "Typescript SDK",
    description: "npm install langfuse",
    href: "https://www.npmjs.com/package/langfuse",
    iconColor: "bg-blue-500",
    icon: CommandLineIcon,
  },
  {
    name: "Python SDK",
    description: "pip install langfuse",
    href: "https://pypi.org/project/langfuse/",
    iconColor: "bg-yellow-500",
    icon: SiPython,
  },
];

export default function GetStartedPage() {
  return (
    <>
      <Header title="Getting started" />
      <div>
        <h2 className="text-base font-semibold leading-6 text-gray-900">
          Integrate langfuse
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Use one of the following reference to start monitoring your
          application with langfuse application
        </p>
        <ul
          role="list"
          className="mt-6 divide-y divide-gray-200 border-b border-t border-gray-200"
        >
          {items.map((item, itemIdx) => (
            <li key={itemIdx}>
              <div className="group relative flex items-start space-x-3 py-4">
                <div className="flex-shrink-0">
                  <span
                    className={clsx(
                      item.iconColor,
                      "inline-flex h-10 w-10 items-center justify-center rounded-lg"
                    )}
                  >
                    <item.icon
                      className="h-6 w-6 text-white"
                      aria-hidden="true"
                    />
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-gray-900">
                    <a href={item.href}>
                      <span className="absolute inset-0" aria-hidden="true" />
                      {item.name}
                    </a>
                  </div>
                  <p className="text-sm text-gray-500">{item.description}</p>
                </div>
                <div className="flex-shrink-0 self-center">
                  <ChevronRightIcon
                    className="h-5 w-5 text-gray-400 group-hover:text-gray-500"
                    aria-hidden="true"
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
