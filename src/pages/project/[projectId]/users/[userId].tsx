import { useRouter } from "next/router";
import Header from "@/src/components/layouts/header";
import { api } from "@/src/utils/api";
import { useState } from "react";
import TracesTable from "@/src/components/table/use-cases/traces";
import ScoresTable from "@/src/components/table/use-cases/scores";

type TabDefinition = {
  name: string;
  current: boolean;
};

export default function TracePage() {
  const router = useRouter();
  const userId = router.query.userId as string;
  const projectId = router.query.projectId as string;

  const [tabs, setTabs] = useState<TabDefinition[]>([
    { name: "Details", current: true },
    { name: "Traces", current: false },
    { name: "Scores", current: false },
  ]);

  const setCurrentTab = (tabName: string) => {
    setTabs(tabs.map((t) => ({ ...t, current: t.name === tabName })));
  };

  function classNames(...classes: string[]) {
    return classes.filter(Boolean).join(" ");
  }

  const renderTabContent = () => {
    const currentTab = tabs.find((tab) => tab.current)?.name;
    switch (currentTab) {
      case "Details":
        return <DetailsTab userId={userId} projectId={projectId} />;
      case "Traces":
        return <TracesTab userId={userId} projectId={projectId} />;
      case "Scores":
        return <ScoresTab userId={userId} projectId={projectId} />;
      default:
        return null;
    }
  };

  return (
    <div className="md:container">
      <Header
        title="User Detail"
        breadcrumb={[
          { name: "Users", href: `/project/${projectId}/users` },
          { name: userId },
        ]}
      />

      <div>
        <div className="sm:hidden">
          <label htmlFor="tabs" className="sr-only">
            Select a tab
          </label>
          <select
            id="tabs"
            name="tabs"
            className="block w-full rounded-md border-gray-300 py-2 pl-3 pr-10 text-base focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
            defaultValue={tabs.find((tab) => tab.current)?.name ?? undefined}
          >
            {tabs.map((tab) => (
              <option key={tab.name}>{tab.name}</option>
            ))}
          </select>
        </div>
        <div className="hidden sm:block">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8" aria-label="Tabs">
              {tabs.map((tab) => (
                <a
                  key={tab.name}
                  className={classNames(
                    tab.current
                      ? "border-indigo-500 text-indigo-600"
                      : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700",
                    "whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium"
                  )}
                  aria-current={tab.current ? "page" : undefined}
                  onClick={() => setCurrentTab(tab.name)}
                >
                  {tab.name}
                </a>
              ))}
            </nav>
          </div>
        </div>
        {renderTabContent()}
      </div>
    </div>
  );
}

type TabProps = {
  userId: string;
  projectId: string;
};

function DetailsTab({ userId, projectId }: TabProps) {
  console.log("DetailsTab", userId, projectId);
  const user = api.users.byId.useQuery({ projectId: projectId, userId });

  return (
    <div className="mt-5 pt-5">
      {user.data ? (
        <div className="mt-6 border-t border-gray-100">
          <dl className="divide-y divide-gray-100">
            <div className="px-4 py-6 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
              <dt className="text-sm font-medium leading-6 text-gray-900">
                User ID
              </dt>
              <dd className="mt-1 text-sm leading-6 text-gray-700 sm:col-span-2 sm:mt-0">
                {user.data?.userId}
              </dd>
            </div>
            <div className="px-4 py-6 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
              <dt className="text-sm font-medium leading-6 text-gray-900">
                First Event
              </dt>
              <dd className="mt-1 text-sm leading-6 text-gray-700 sm:col-span-2 sm:mt-0">
                {user.data?.firstEvent?.toISOString() ?? "No events yet"}
              </dd>
            </div>
            <div className="px-4 py-6 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
              <dt className="text-sm font-medium leading-6 text-gray-900">
                Last Event
              </dt>
              <dd className="mt-1 text-sm leading-6 text-gray-700 sm:col-span-2 sm:mt-0">
                {user.data?.lastEvent?.toISOString() ?? "No events yet"}
              </dd>
            </div>
            <div className="px-4 py-6 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
              <dt className="text-sm font-medium leading-6 text-gray-900">
                Total Events
              </dt>
              <dd className="mt-1 text-sm leading-6 text-gray-700 sm:col-span-2 sm:mt-0">
                {(
                  (user.data?.totalTraces ?? 0) +
                  (user.data?.totalObservations ?? 0)
                ).toString()}
              </dd>
            </div>
          </dl>
        </div>
      ) : undefined}
    </div>
  );
}

function ScoresTab({ userId, projectId }: TabProps) {
  return (
    <div className="mt-5 pt-5">
      <ScoresTable projectId={projectId} userId={userId} />
    </div>
  );
}

function TracesTab({ userId, projectId }: TabProps) {
  return (
    <div className="mt-5 pt-5">
      <TracesTable projectId={projectId} userId={userId} />
    </div>
  );
}
