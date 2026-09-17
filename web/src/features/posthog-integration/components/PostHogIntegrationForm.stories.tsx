import { expect, fn, userEvent, within } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { PostHogIntegrationForm } from "./PostHogIntegrationForm";

const exportSourceOptions = [
  {
    value: "TRACES_OBSERVATIONS" as const,
    label: "Traces and observations",
    description: "Export traces and observations from the legacy data model.",
    unavailable: false,
  },
  {
    value: "TRACES_OBSERVATIONS_EVENTS" as const,
    label: "Traces, observations, and events",
    description: "Export data from both data models.",
    unavailable: false,
  },
  {
    value: "EVENTS" as const,
    label: "Events",
    description: "Export events from the enriched data model.",
    unavailable: false,
  },
];

const exportSourceContext = {
  isCloud: false,
  enrichedAvailable: true,
  legacyWritesActive: true,
};

const meta = preview.meta({
  component: PostHogIntegrationForm,
  args: {
    actionState: "idle" as const,
    configurationState: "new" as const,
    defaultValues: {
      enabled: false,
      exportSource: "EVENTS" as const,
      posthogHostname: "https://us.posthog.com",
      posthogProjectApiKey: "",
    },
    exportSourceContext,
    exportSourceOptions,
    onReset: fn(),
    onSubmit: fn(),
    showExportSourceField: true,
  },
});

export const NewIntegration = meta.story({});

export const ExistingIntegration = meta.story({
  args: {
    configurationState: "configured" as const,
    projectApiKeyDisplay: "phc_...cdef",
    defaultValues: {
      enabled: true,
      exportSource: "EVENTS" as const,
      posthogHostname: "https://eu.posthog.com",
      posthogProjectApiKey: "",
    },
  },
});

export const ValidationErrors = meta.story({
  name: "(Test) Validation errors",
  args: {
    defaultValues: {
      enabled: false,
      exportSource: "EVENTS" as const,
      posthogHostname: "",
      posthogProjectApiKey: "",
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByRole("button", { name: "Save" }));

    await expect(
      canvas.getByText("PostHog Project API Key is required"),
    ).toBeInTheDocument();
  },
});

export const UnavailableExportSource = meta.story({
  args: {
    configurationState: "configured" as const,
    projectApiKeyDisplay: "phc_...cdef",
    defaultValues: {
      enabled: true,
      exportSource: "TRACES_OBSERVATIONS" as const,
      posthogHostname: "https://us.posthog.com",
      posthogProjectApiKey: "",
    },
    exportSourceContext: {
      isCloud: false,
      enrichedAvailable: true,
      legacyWritesActive: false,
    },
    exportSourceOptions: [
      {
        value: "TRACES_OBSERVATIONS" as const,
        label: "Traces and observations",
        description:
          "Export traces and observations from the legacy data model.",
        unavailable: true,
      },
      {
        value: "EVENTS" as const,
        label: "Events",
        description: "Export events from the enriched data model.",
        unavailable: false,
      },
    ],
  },
});
