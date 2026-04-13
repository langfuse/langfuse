import { useRouter } from "next/router";
import { useEffect } from "react";
import Page from "@/src/components/layouts/page";
import { FlaskConical, Loader2 } from "lucide-react";
import { useExperimentAccess } from "@/src/features/experiments/hooks/useExperimentAccess";
import {
  EXPERIMENT_RUN_TABS,
  getExperimentRunTabs,
} from "@/src/features/navigation/utils/experiment-run-tabs";
import useSessionStorage from "@/src/components/useSessionStorage";
import { ExperimentsBetaSwitch } from "@/src/features/experiments/components/ExperimentsBetaSwitch";

export default function ExperimentAnalytics() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  const {
    canAccessExperiments,
    canUseExperimentsBetaToggle,
    isExperimentsBetaActive,
    setExperimentsBetaEnabled,
  } = useExperimentAccess();

  const [lastResultsUrl] = useSessionStorage<string | null>(
    "experiment-results-url",
    null,
  );

  const handleResultsClick = () => {
    const fallbackUrl = `/project/${projectId}/experiments/results`;
    void router.push(lastResultsUrl ?? fallbackUrl);
  };

  const betaSwitch = canUseExperimentsBetaToggle ? (
    <ExperimentsBetaSwitch
      enabled={isExperimentsBetaActive}
      onEnabledChange={setExperimentsBetaEnabled}
    />
  ) : null;

  // Auto-redirect when beta is off
  useEffect(() => {
    if (canAccessExperiments && !isExperimentsBetaActive && lastResultsUrl) {
      void router.push(lastResultsUrl);
    }
  }, [canAccessExperiments, isExperimentsBetaActive, lastResultsUrl, router]);

  if (!canAccessExperiments) {
    return (
      <Page headerProps={{ title: "Analytics" }}>
        <div className="p-4">Experiments Pages coming soon.</div>
      </Page>
    );
  }

  if (!isExperimentsBetaActive) {
    return (
      <Page headerProps={{ title: "Analytics" }}>
        <div className="flex h-full items-center justify-center">
          <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
        </div>
      </Page>
    );
  }

  return (
    <Page
      headerProps={{
        title: "Analytics",
        itemType: "EXPERIMENT",
        breadcrumb: [
          { name: "Experiments", href: `/project/${projectId}/experiments` },
        ],
        tabsProps: {
          tabs: getExperimentRunTabs(projectId, handleResultsClick),
          activeTab: EXPERIMENT_RUN_TABS.ANALYTICS,
        },
        actionButtonsLeft: betaSwitch,
      }}
    >
      <div className="flex h-full flex-col items-center justify-center p-8">
        <div className="border-border bg-card/50 flex max-w-md flex-col items-center gap-4 rounded-xl border p-8 text-center shadow-sm backdrop-blur-sm">
          <div className="bg-muted flex h-16 w-16 items-center justify-center rounded-full">
            <FlaskConical className="text-muted-foreground h-8 w-8" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-semibold tracking-tight">
              Analytics Coming Soon
            </h3>
            <p className="text-muted-foreground text-sm leading-relaxed">
              We are working on adding advanced analytics capabilities for
              experiments.
            </p>
          </div>
        </div>
      </div>
    </Page>
  );
}
