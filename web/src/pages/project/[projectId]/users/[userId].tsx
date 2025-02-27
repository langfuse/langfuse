import { useRouter } from "next/router";
import { api } from "@/src/utils/api";
import TracesTable from "@/src/components/table/use-cases/traces";
import ScoresTable from "@/src/components/table/use-cases/scores";
import { compactNumberFormatter, usdFormatter } from "@/src/utils/numbers";
import { StringParam, useQueryParam, withDefault } from "use-query-params";
import { DetailPageNav } from "@/src/features/navigate-detail-pages/DetailPageNav";
import SessionsTable from "@/src/components/table/use-cases/sessions";
import { cn } from "@/src/utils/tailwind";
import { Badge } from "@/src/components/ui/badge";
import { ActionButton } from "@/src/components/ActionButton";
import { LayoutDashboard } from "lucide-react";
import Page from "@/src/components/layouts/page";

const tabs = ["Traces", "Sessions", "Scores"] as const;

export default function UserPage() {
  const router = useRouter();
  const userId = router.query.userId as string;
  const projectId = router.query.projectId as string;

  const user = api.users.byId.useQuery({
    projectId: projectId,
    userId,
  });

  const [currentTab, setCurrentTab] = useQueryParam(
    "tab",
    withDefault(StringParam, tabs[0]),
  );

  const renderTabContent = () => {
    switch (currentTab as (typeof tabs)[number]) {
      case "Sessions":
        return <SessionsTab userId={userId} projectId={projectId} />;
      case "Traces":
        return <TracesTab userId={userId} projectId={projectId} />;
      case "Scores":
        return <ScoresTab userId={userId} projectId={projectId} />;
      default:
        return null;
    }
  };

  const handleTabChange = async (tab: string) => {
    if (router.query.filter || router.query.orderBy) {
      const newQuery = { ...router.query };
      delete newQuery.filter;
      delete newQuery.orderBy;
      await router.replace({ query: newQuery });
    }
    setCurrentTab(tab);
  };

  return (
    <Page
      headerProps={{
        title: userId,
        breadcrumb: [{ name: "Users", href: `/project/${projectId}/users` }],
        itemType: "USER",

        actionButtonsRight: (
          <>
            <ActionButton
              href={`/project/${projectId}?filter=user%3Bstring%3B%3B%3D%3B${userId}`} // dashboard filter serialization
              variant="secondary"
              icon={<LayoutDashboard className="h-4 w-4" />}
            >
              Dashboard
            </ActionButton>
            <DetailPageNav
              currentId={encodeURIComponent(userId)}
              path={(entry) =>
                `/project/${projectId}/users/${encodeURIComponent(entry.id)}`
              }
              listKey="users"
            />
          </>
        ),
      }}
    >
      <>
        {user.data && (
          <div className="my-3 flex flex-wrap gap-2 px-1">
            <Badge variant="outline">
              Observations:{" "}
              {compactNumberFormatter(user.data.totalObservations)}
            </Badge>
            <Badge variant="outline">
              Traces: {compactNumberFormatter(user.data.totalTraces)}
            </Badge>
            <Badge variant="outline">
              Total Tokens: {compactNumberFormatter(user.data.totalTokens)}
            </Badge>
            <Badge variant="outline">
              <span className="flex items-center gap-1">
                Total Cost: {usdFormatter(user.data.sumCalculatedTotalCost)}
              </span>
            </Badge>
            <Badge variant="outline">
              Active:{" "}
              {user.data.firstTrace
                ? `${user.data.firstTrace.toLocaleString()} - ${user.data.lastTrace?.toLocaleString()}`
                : "No traces yet"}
            </Badge>
          </div>
        )}

        <div className="my-3 border-t border-border" />

        <div>
          <div className="sm:hidden">
            <label htmlFor="tabs" className="sr-only">
              Select a tab
            </label>
            <select
              id="tabs"
              name="tabs"
              className="block w-full rounded-md border-border bg-background py-1 pl-3 pr-10 text-base text-foreground focus:outline-none sm:text-sm"
              defaultValue={currentTab}
              onChange={(e) => handleTabChange(e.currentTarget.value)}
            >
              {tabs.map((tab) => (
                <option key={tab}>{tab}</option>
              ))}
            </select>
          </div>
          <div className="hidden sm:block">
            <div className="border-b border-border">
              <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                {tabs.map((tab) => (
                  <button
                    key={tab}
                    className={cn(
                      tab === currentTab
                        ? "border-primary-accent text-primary-accent"
                        : "border-transparent text-muted-foreground hover:border-border hover:text-primary",
                      "whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium",
                    )}
                    aria-current={tab === currentTab ? "page" : undefined}
                    onClick={() => handleTabChange(tab)}
                  >
                    {tab}
                  </button>
                ))}
              </nav>
            </div>
          </div>
        </div>
        {renderTabContent()}
      </>
    </Page>
  );
}

type TabProps = {
  userId: string;
  projectId: string;
};

function ScoresTab({ userId, projectId }: TabProps) {
  return (
    <ScoresTable
      projectId={projectId}
      userId={userId}
      omittedFilter={["User ID"]}
    />
  );
}

function TracesTab({ userId, projectId }: TabProps) {
  return (
    <TracesTable
      projectId={projectId}
      userId={userId}
      omittedFilter={["User ID"]}
    />
  );
}

function SessionsTab({ userId, projectId }: TabProps) {
  return (
    <SessionsTable
      projectId={projectId}
      userId={userId}
      omittedFilter={["User IDs"]}
    />
  );
}
