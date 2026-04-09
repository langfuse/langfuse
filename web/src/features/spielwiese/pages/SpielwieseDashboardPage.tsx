import {
  getSpielwieseDashboardVm,
  getSpielwieseShellVm,
} from "../adapters/dashboardVm";
import { DashboardHero } from "../components/DashboardHero";
import { InsightPanel } from "../components/InsightPanel";
import { MetricStrip } from "../components/MetricStrip";
import { SpielwieseDashboardShell } from "../shell/SpielwieseDashboardShell";

export default function SpielwieseDashboardPage() {
  const shell = getSpielwieseShellVm();
  const dashboard = getSpielwieseDashboardVm();

  return (
    <div className="isolate min-h-dvh antialiased" data-spielwiese>
      <SpielwieseDashboardShell dashboard={dashboard} shell={shell}>
        <DashboardHero header={dashboard.header} />
        <MetricStrip metrics={dashboard.metrics} />
        <InsightPanel insights={dashboard.insights} />
      </SpielwieseDashboardShell>
    </div>
  );
}
