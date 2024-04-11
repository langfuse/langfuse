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
import { env } from "@/src/env.mjs";
import { Card } from "@tremor/react";
import { Button } from "@/src/components/ui/button";
import Link from "next/link";

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
        <Beta />
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
      <Header title="Docs" level="h3" />
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

const Beta = () => {
  if (env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === undefined) return null;

  return (
    <div>
      <Header title="Early Access" level="h3" />
      <Card className="p-4 lg:w-1/2">
        <img
          src="/images/posthog-logo.svg"
          alt="Posthog Logo"
          className="mb-4 w-32"
        />
        <p className="mb-4 text-sm text-gray-700">
          We have teamed up with PostHog (OSS product analytics) to make
          Langfuse Events/Metrics available in your Posthog Dashboards.
        </p>
        <div className="flex items-center gap-2">
          <Button asChild variant="secondary">
            <Link
              href={`mailto:early-access@langfuse.com?subject=I%20am%20interested%20in%20the%20Langfuse%3C%3EPosthog%20Integration&body=%23%23%20Please%20fill%20in%20the%20following%20details%20to%20help%20us%20set%20up%20the%20integration%20for%20you.%20These%20settings%20will%20be%20available%20within%20Langfuse%20once%20this%20integration%20is%20generally%20available.%0A%0ALangfuse%20Project%3A%20${encodeURIComponent(window.location.href.replace("/settings", ""))}%0APostHog%20Host%20(EU%2C%20US%20or%20self-hosted)%3A%0APostHog%20Key%20(starting%20with%20%22phc_%22)%3A%0A%0A%0A%23%23%20Do%20you%20prefer%20to%20set%20this%20up%20via%20a%20short%20call%20or%20async%20via%20email%3F%0A%0A%0A%0A%23%23%20Any%20Questions%3F%0A%0A%0A%0A%23%23%20Links%20to%20docs%0A%0Ahttps%3A%2F%2Flangfuse.com%2Fdocs%2Fanalytics%2Fposthog%0Ahttps%3A%2F%2Fposthog.com%2Fdocs%2Fproduct-analytics%2Fllms%0A`}
            >
              Request Access (Email)
            </Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="https://langfuse.com/docs/analytics/posthog">
              Integration Docs
            </Link>
          </Button>
        </div>
      </Card>
    </div>
  );
};
