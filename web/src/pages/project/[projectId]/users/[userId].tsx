import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import { api } from "@/src/utils/api";
import TracesTable from "@/src/components/table/use-cases/traces";
import ScoresTable from "@/src/components/table/use-cases/scores";
import { compactNumberFormatter, usdFormatter } from "@/src/utils/numbers";
import { StringParam, useQueryParam, withDefault } from "use-query-params";
import { DetailPageNav } from "@/src/features/navigate-detail-pages/DetailPageNav";
import SessionsTable from "@/src/components/table/use-cases/sessions";
import { cn } from "@/src/utils/tailwind";
import { Badge } from "@/src/components/ui/badge";
import { Switch } from "@/src/components/ui/switch";
import { Label } from "@/src/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { ActionButton } from "@/src/components/ActionButton";
import { LayoutDashboard } from "lucide-react";
import Page from "@/src/components/layouts/page";
import { useObservationListBeta } from "@/src/features/events/hooks/useObservationListBeta";
import { ObservationsEventsTable } from "@/src/features/events/components";

const tabs = ["Traces", "Sessions", "Scores"] as const;

export default function UserPage() {
  const router = useRouter();
  const userId = router.query.userId as string;
  const projectId = router.query.projectId as string;
  const { data: session } = useSession();
  const { isBetaEnabled, setBetaEnabled } = useObservationListBeta();

  // TODO: remove for prod go-live
  const showBetaToggle = session?.user?.email?.endsWith("@langfuse.com");

  // Legacy API call (traces-based)
  const userLegacy = api.users.byId.useQuery(
    {
      projectId: projectId,
      userId,
    },
    { enabled: !isBetaEnabled },
  );

  // Beta API call (events-based)
  const userBeta = api.users.byIdFromEvents.useQuery(
    {
      projectId: projectId,
      userId,
    },
    { enabled: isBetaEnabled },
  );

  const user = isBetaEnabled ? userBeta : userLegacy;

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

  const betaToggle = showBetaToggle ? (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-2">
            <Switch
              id="beta-toggle"
              checked={isBetaEnabled}
              onCheckedChange={setBetaEnabled}
            />
            <Label htmlFor="beta-toggle" className="cursor-pointer text-xs">
              Beta
            </Label>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>Try the events-based user view with observation timestamps</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ) : null;

  return (
    <Page
      headerProps={{
        title: userId,
        breadcrumb: [{ name: "Users", href: `/project/${projectId}/users` }],
        itemType: "USER",
        actionButtonsLeft: betaToggle,
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
          <div className="flex flex-wrap gap-2 px-4 py-4">
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
                : isBetaEnabled
                  ? "No activity yet"
                  : "No traces yet"}
            </Badge>
          </div>
        )}

        <div className="border-t border-border" />

        <div>
          <div className="sm:hidden">
            <label htmlFor="tabs" className="sr-only">
              Select a tab
            </label>
            <select
              id="tabs"
              name="tabs"
              className="block w-full rounded-md border-border bg-background py-2 pl-3 pr-10 text-base text-foreground focus:outline-none sm:text-sm"
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
              <nav className="-mb-px flex" aria-label="Tabs">
                {tabs.map((tab) => (
                  <button
                    key={tab}
                    className={cn(
                      tab === currentTab
                        ? "border-primary-accent text-primary-accent"
                        : "border-transparent text-muted-foreground hover:border-border hover:text-primary",
                      "whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium",
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
        <div className="flex flex-1 overflow-hidden">{renderTabContent()}</div>
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
  const { isBetaEnabled } = useObservationListBeta();

  if (isBetaEnabled) {
    return <ObservationsEventsTable projectId={projectId} userId={userId} />;
  }

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
