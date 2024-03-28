import { ChevronRightIcon } from "@heroicons/react/20/solid";
import { CommandLineIcon, RocketLaunchIcon } from "@heroicons/react/24/outline";
import { SiPython } from "react-icons/si";
import Header from "@/src/components/layouts/header";
import { ApiKeyList } from "@/src/features/public-api/components/ApiKeyList";
import { useRouter } from "next/router";
import { Code, Bird, GraduationCap } from "lucide-react";
import { ProjectMembersTable } from "@/src/features/rbac/components/ProjectMembersTable";
import { DeleteProjectButton } from "@/src/features/projects/components/DeleteProjectButton";
import { HostNameProject } from "@/src/features/projects/components/HostNameProject";
import { ProjectUsageChart } from "@/src/features/usage-metering/ProjectUsageChart";
import { TransferOwnershipButton } from "@/src/features/projects/components/TransferOwnershipButton";
import RenameProject from "@/src/features/projects/components/RenameProject";

export default function SettingsPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  return (
    <div className="md:container">
      <Header title="Settings" />
      <div className="flex flex-col gap-10">
        <ProjectMembersTable projectId={projectId} />
        <RenameProject projectId={projectId} />
        <HostNameProject />
        <ApiKeyList projectId={projectId} />
        <ProjectUsageChart projectId={projectId} />
        <Instructions />
        <div className="space-y-3">
          <DeleteProjectButton projectId={projectId} />
          <TransferOwnershipButton projectId={projectId} />
        </div>
      </div>
    </div>
  );
}

const instructionItems = [
  {
    name: "Introduction",
    description:
      "Understand the basics of langfuse: tracing and feedback collection",
    href: "https://langfuse.com/docs",
    icon: GraduationCap,
  },
  {
    name: "Quickstart",
    description: "Follow the quickstart to integrate langfuse into your app",
    href: "https://langfuse.com/docs/get-started",
    icon: RocketLaunchIcon,
  },
  {
    name: "Langchain integration",
    description:
      "Trace your Langchain llm/chain/agent/... with a single line of code",
    href: "https://langfuse.com/docs/langchain",
    icon: Bird,
  },
  {
    name: "Typescript SDK",
    description: "npm install langfuse",
    href: "https://langfuse.com/docs/sdk/typescript",
    icon: CommandLineIcon,
  },
  {
    name: "Python SDK",
    description: "pip install langfuse",
    href: "https://langfuse.com/docs/sdk/python",
    icon: SiPython,
  },
  {
    name: "API Reference (Swagger)",
    description: "Custom integration",
    href: "https://langfuse.com/docs/reference",
    icon: Code,
  },
];

function Instructions() {
  return (
    <div>
      <h2 className="text-base font-semibold leading-6 text-gray-900">
        Integrate langfuse
      </h2>
      <ul
        role="list"
        className="mt-6 divide-y divide-gray-200 border-b border-t border-gray-200"
      >
        {instructionItems.map((item, itemIdx) => (
          <li key={itemIdx}>
            <div className="group relative flex items-start space-x-3 py-4">
              <div className="flex-shrink-0">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 text-gray-400 group-hover:border-indigo-600 group-hover:text-indigo-600">
                  <item.icon className="h-6 w-6" aria-hidden="true" />
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-gray-900">
                  <a href={item.href} target="_blank" rel="noreferrer noopener">
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
  );
}
