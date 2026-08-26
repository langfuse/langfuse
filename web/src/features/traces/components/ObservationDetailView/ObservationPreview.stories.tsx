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

export const JsonError = meta.story({
  args: {
    previewKey: "json-error-observation",
    previewProps: {
      input: {
        customerId: "customer-123",
        question: "How do I reduce API latency?",
      },
      output: null,
      status: {
        level: "ERROR",
        message: JSON.stringify(
          {
            error: {
              code: "upstream_timeout",
              message: "The upstream model did not respond in time.",
              retryable: true,
            },
            requestId: "req_01K3H8TQ9V",
          },
          null,
          2,
        ),
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

export const Warning = meta.story({
  args: {
    previewKey: "warning-observation",
    previewProps: {
      input: {
        customerId: "customer-123",
        question: "How do I reduce API latency?",
      },
      output: {
        recommendation: "Enable prompt caching and stream the response.",
        latencyMs: 1842,
      },
      status: {
        level: "WARNING",
        message: "The response completed after one automatic retry.",
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

export const Debug = meta.story({
  args: {
    previewKey: "debug-observation",
    previewProps: {
      input: {
        customerId: "customer-123",
        question: "How do I reduce API latency?",
      },
      output: {
        recommendation: "Enable prompt caching and stream the response.",
        latencyMs: 842,
      },
      status: {
        level: "DEBUG",
        message: "Prompt cache lookup completed without a matching entry.",
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

export const Info = meta.story({
  args: {
    previewKey: "info-observation",
    previewProps: {
      input: {
        customerId: "customer-123",
        question: "How do I reduce API latency?",
      },
      output: {
        recommendation: "Enable prompt caching and stream the response.",
        latencyMs: 842,
      },
      status: {
        level: "DEFAULT",
        message: "The response completed with additional status details.",
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
