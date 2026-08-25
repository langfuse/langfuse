import preview from "../../../../../.storybook/preview";
import { ObservationPreview } from "./ObservationPreview";

const meta = preview.meta({
  component: ObservationPreview,
});

export const Default = meta.story({
  args: {
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
  },
});

export const Error = meta.story({
  args: {
    previewKey: "error-observation",
    previewProps: {
      input: {
        customerId: "customer-123",
        question: "How do I reduce API latency?",
      },
      output: null,
      status: {
        level: "ERROR",
        message: "Upstream model request timed out after 30 seconds",
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
  },
});
