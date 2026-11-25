import { fireEvent, render, screen } from "@testing-library/react";

import { LayerProvider } from "@/src/context/LayerContext/LayerContext";

import { TraceRuleSavedDialog } from "./TraceRuleSavedDialog";

const CUSTOMER_RULE_NAME = "Customer confidential trace rule";

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    useUtils: () => ({
      evalsV2: {
        invalidate: vi.fn(),
      },
    }),
    evalsV2: {
      rules: {
        list: {
          useQuery: () => ({
            data: {
              rules: [
                {
                  id: "rule-1",
                  name: CUSTOMER_RULE_NAME,
                  enabled: true,
                  sampling: 1,
                  filter: [],
                  assignments: [],
                },
              ],
            },
          }),
        },
        createTraceTranscriptRule: {
          useMutation: () => ({
            isPending: false,
            mutateAsync: vi.fn(),
          }),
        },
        attach: {
          useMutation: () => ({
            isPending: false,
            mutateAsync: vi.fn(),
          }),
        },
        update: {
          useMutation: () => ({
            isPending: false,
            mutateAsync: vi.fn(),
          }),
        },
      },
    },
  },
}));

describe("TraceRuleSavedDialog", () => {
  const originalScrollIntoView = Element.prototype.scrollIntoView;
  const originalHasPointerCapture = Element.prototype.hasPointerCapture;

  beforeAll(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    if (!Element.prototype.scrollIntoView) {
      Element.prototype.scrollIntoView = () => {};
    }
    if (!Element.prototype.hasPointerCapture) {
      Element.prototype.hasPointerCapture = () => false;
    }
  });

  afterAll(() => {
    vi.unstubAllGlobals();
    Element.prototype.scrollIntoView = originalScrollIntoView;
    Element.prototype.hasPointerCapture = originalHasPointerCapture;
  });

  it("blocks trace rule names from session replay in the dialog and portaled select list", async () => {
    render(
      <TraceRuleSavedDialog
        projectId="project-1"
        evaluator={{
          id: "eval-1",
          name: "Customer evaluator",
          filter: [],
          variableMapping: [],
        }}
        onDismiss={vi.fn().mockResolvedValue(undefined)}
        onFinish={vi.fn().mockResolvedValue(undefined)}
      />,
      { wrapper: LayerProvider },
    );

    const dialog = screen.getByRole("dialog", { name: "Evaluator saved" });
    const trigger = screen.getByRole("combobox", { name: "Trace rule" });

    fireEvent.keyDown(trigger, { key: "ArrowDown" });

    const listbox = await screen.findByRole("listbox");
    const option = screen.getByRole("option", { name: CUSTOMER_RULE_NAME });

    expect(listbox).toHaveClass("ph-no-capture");
    expect(option.closest(".ph-no-capture")).not.toBeNull();
    const openTitledElements = document.querySelectorAll(
      `[title="${CUSTOMER_RULE_NAME}"]`,
    );
    expect(openTitledElements.length).toBeGreaterThan(0);
    for (const element of openTitledElements) {
      expect(element.closest(".ph-no-capture")).not.toBeNull();
    }

    fireEvent.click(option);

    expect(dialog).toHaveClass("ph-no-capture");
    expect(trigger).toHaveAttribute("title", CUSTOMER_RULE_NAME);
    expect(trigger.closest(".ph-no-capture")).not.toBeNull();
    const selectedTitledElements = document.querySelectorAll(
      `[title="${CUSTOMER_RULE_NAME}"]`,
    );
    expect(selectedTitledElements.length).toBeGreaterThan(0);
    for (const element of selectedTitledElements) {
      expect(element.closest(".ph-no-capture")).not.toBeNull();
    }
  });
});
