import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  useJumpToPlayground,
  type JumpToPlaygroundSourceProps,
} from "./JumpToPlaygroundDropdownMenuController";
import { getWindowState } from "../storage/windowStorage";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  capture: vi.fn(),
  apiKeys: { data: { data: [] } },
}));

vi.mock("next/router", () => ({
  useRouter: () => ({
    isReady: true,
    query: { projectId: "project" },
    push: mocks.push,
  }),
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    llmApiKey: { effective: { useQuery: () => mocks.apiKeys } },
  },
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => mocks.capture,
}));

vi.mock("@/src/features/notifications/showToast", () => ({
  showToast: vi.fn(),
}));

type Generation = Extract<
  JumpToPlaygroundSourceProps,
  { source: "generation" }
>["generation"];

const generation = (input: string): Generation => ({
  id: "generation",
  traceId: "trace",
  projectId: "project",
  environment: "default",
  type: "GENERATION",
  startTime: new Date(0),
  endTime: new Date(1),
  name: null,
  metadata: null,
  parentObservationId: null,
  level: "DEFAULT",
  statusMessage: null,
  version: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  model: null,
  internalModelId: null,
  modelParameters: null,
  input,
  output: null,
  completionStartTime: null,
  promptId: null,
  promptName: null,
  promptVersion: null,
  latency: null,
  timeToFirstToken: null,
  providedUsageDetails: {},
  usageDetails: {},
  costDetails: {},
  providedCostDetails: {},
  inputCost: null,
  outputCost: null,
  totalCost: null,
  inputUsage: 0,
  outputUsage: 0,
  totalUsage: 0,
  usagePricingTierId: null,
  usagePricingTierName: null,
  toolDefinitions: null,
  toolCalls: null,
  toolCallNames: null,
});

describe("Generation Playground replay", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(cleanup);

  it.each([
    { input: "12345678901", expected: "12345678901" },
    { input: "0", expected: "0" },
    { input: "true", expected: "true" },
    { input: "false", expected: "false" },
    { input: "null", expected: "null" },
    { input: "Ordinary prompt", expected: "Ordinary prompt" },
    { input: '"12345678901"', expected: "12345678901" },
    {
      input: '[{"role":"user","content":"JSON message"}]',
      expected: "JSON message",
    },
  ])("opens $input without losing its message", async ({ input, expected }) => {
    const { result } = renderHook(() =>
      useJumpToPlayground({
        source: "generation",
        generation: generation(input),
        analyticsEventName: "trace_detail:test_in_playground_button_click",
      }),
    );

    expect(result.current.disabled).toBe(false);
    act(() => result.current.handlePlaygroundAction("fresh"));

    await waitFor(() => {
      expect(getWindowState("playground-generation-generation")).toMatchObject({
        messages: [{ content: expected }],
      });
    });
    expect(mocks.push).toHaveBeenCalledWith("/project/project/playground");
  });
});
