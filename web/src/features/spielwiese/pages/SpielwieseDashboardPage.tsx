import { ActivityWidget } from "../components/dashboard/ActivityWidget";
import { MetricStrip } from "../components/dashboard/MetricStrip";
import { SpielwieseDashboardShell } from "../shell/SpielwieseDashboardShell";

const metrics = [
  {
    id: "latency",
    label: "Median end-to-end latency for local preview",
    value: "482 ms",
  },
  {
    id: "feedback",
    label: "Feedback completion rate across active review queues",
    value: "74%",
  },
  {
    id: "sessions",
    label: "Active sessions sampled into the redesign preview",
    value: "1,284",
  },
];

export default function SpielwieseDashboardPage() {
  return (
    <div className="antialiased" data-spielwiese>
      <SpielwieseDashboardShell>
        <MetricStrip metrics={metrics} />
        <ActivityWidget />
      </SpielwieseDashboardShell>
    </div>
  );
}
