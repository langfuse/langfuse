import { fn } from "storybook/test";
import { useState, type ComponentProps } from "react";

import preview from "../../../../../.storybook/preview";
import { ItemBadge } from "@/src/components/ItemBadge";
import { LevelBadge } from "@/src/features/traces/components/ObservationMetadataBadgesSimple/ObservationMetadataBadgesSimple";
import { ObservationDetailView } from "./ObservationDetailView";

function InteractiveObservationDetailView(
  args: ComponentProps<typeof ObservationDetailView>,
) {
  const [currentView, setCurrentView] = useState(args.currentView);
  const [jsonBetaEnabled, setJsonBetaEnabled] = useState(args.jsonBetaEnabled);

  return (
    <ObservationDetailView
      {...args}
      currentView={currentView}
      jsonBetaEnabled={jsonBetaEnabled}
      onViewTabChange={(tab) => {
        const nextView =
          tab === "pretty" ? "pretty" : jsonBetaEnabled ? "json-beta" : "json";
        setCurrentView(nextView);
        args.onViewTabChange(tab);
      }}
      onBetaToggle={(enabled) => {
        setJsonBetaEnabled(enabled);
        setCurrentView(enabled ? "json-beta" : "json");
        args.onBetaToggle(enabled);
      }}
    />
  );
}

const meta = preview.meta({
  component: ObservationDetailView,
  render: (args) => <InteractiveObservationDetailView {...args} />,
});

export const Default = meta.story({
  args: {
    header: (
      <div className="shrink-0 space-y-2 border-b p-2">
        <div className="flex items-center gap-1">
          <ItemBadge type="GENERATION" isSmall />
          <span className="font-bold">customer-support-answer</span>
        </div>
        <div className="text-sm">2026-08-25 10:24:31.842</div>
      </div>
    ),
    selectedTab: "preview",
    onSelectedTabChange: fn(),
    currentView: "pretty",
    jsonBetaEnabled: false,
    onViewTabChange: fn(),
    onBetaToggle: fn(),
    tags: ["production", "support"],
    previewKey: "default-observation",
    previewProps: {
      input: {
        customerId: "customer-123",
        question: "How do I reduce API latency?",
      },
      output: {
        recommendation: "Enable prompt caching and stream the response.",
        latencyMs: 842,
      },
      metadata: {
        model: "example-model",
        region: "eu-west-1",
      },
      projectId: "storybook-project",
      traceId: "storybook-trace",
      showMetadata: true,
      showCorrections: false,
    },
    showTabsBar: true,
  },
});

export const Error = meta.story({
  args: {
    header: (
      <div className="shrink-0 space-y-2 border-b p-2">
        <div className="flex items-center gap-1">
          <ItemBadge type="GENERATION" isSmall />
          <span className="font-bold">customer-support-answer</span>
        </div>
        <div className="text-sm">2026-08-25 10:24:31.842</div>
        <div className="flex flex-wrap items-center gap-1">
          <LevelBadge level="ERROR" />
        </div>
      </div>
    ),
    selectedTab: "preview",
    onSelectedTabChange: fn(),
    currentView: "pretty",
    jsonBetaEnabled: false,
    onViewTabChange: fn(),
    onBetaToggle: fn(),
    previewKey: "error-observation",
    previewProps: {
      input: {
        customerId: "customer-123",
        question: "How do I reduce API latency?",
      },
      output: null,
      statusMessage: "Upstream model request timed out after 30 seconds",
      metadata: {
        model: "example-model",
        region: "eu-west-1",
      },
      projectId: "storybook-project",
      traceId: "storybook-trace",
      showMetadata: true,
      showCorrections: false,
    },
    showTabsBar: true,
  },
});
