import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { type GetModelResult } from "@/src/features/models/validation";

const upsertMutateAsync = vi.fn().mockResolvedValue({
  id: "model-1",
  modelName: "gpt-realtime-2.1",
});

vi.mock("@/src/utils/api", () => ({
  api: {
    useUtils: () => ({ models: { invalidate: vi.fn() } }),
    models: {
      upsert: {
        useMutation: () => ({
          mutateAsync: upsertMutateAsync,
          isPending: false,
        }),
      },
    },
  },
}));

vi.mock("next/router", () => ({
  useRouter: () => ({ push: vi.fn(), query: { projectId: "p1" } }),
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));

vi.mock("@/src/features/notifications/showSuccessToast", () => ({
  showSuccessToast: vi.fn(),
}));

vi.mock("@/src/components/editor", () => ({
  CodeMirrorEditor: () => null,
}));

import { UpsertModelFormDialog } from "./UpsertModelFormDialog";

const modelData: GetModelResult = {
  id: "model-1",
  projectId: "p1",
  modelName: "gpt-realtime-2.1",
  matchPattern: "(?i)^(gpt-realtime-2.1)$",
  tokenizerConfig: null,
  tokenizerId: null,
  pricingTiers: [
    {
      id: "tier-default",
      name: "Standard",
      isDefault: true,
      priority: 0,
      conditions: [],
      prices: { text_input: 0.000004, text_output: 0.000016, audio: 0.00003 },
    },
    {
      id: "tier-long",
      name: "Long context",
      isDefault: false,
      priority: 1,
      conditions: [
        {
          usageDetailPattern: "^text_input",
          operator: "gt",
          value: 128000,
          caseSensitive: false,
        },
      ],
      prices: { text_input: 0.000008, text_output: 0.000032, audio: 0.00006 },
    },
  ],
};

/** Types character by character, as a user does — one change event per key. */
const typeInto = (input: HTMLInputElement, text: string) => {
  for (const character of text) {
    fireEvent.change(input, { target: { value: input.value + character } });
  }
};

const openEditDialog = () => {
  render(
    <UpsertModelFormDialog action="edit" projectId="p1" modelData={modelData}>
      <button>Open editor</button>
    </UpsertModelFormDialog>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Open editor" }));
};

const usageTypeInput = (name: string) =>
  screen
    .getAllByLabelText(/^Usage type \d+$/)
    .find((input): input is HTMLInputElement => {
      return (input as HTMLInputElement).value === name;
    })!;

describe("UpsertModelFormDialog price editor", () => {
  beforeAll(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    Element.prototype.scrollIntoView = vi.fn();
    Element.prototype.hasPointerCapture = vi.fn();
  });

  beforeEach(() => {
    upsertMutateAsync.mockClear();
  });

  it("keeps every keystroke when a usage type extends an existing one", () => {
    openEditDialog();

    // `text_input_cached` passes through the existing key `text_input`.
    typeInto(usageTypeInput("text_input"), "_cached");
    const priceInput = screen.getByLabelText(
      "Standard price for text_input_cached",
    ) as HTMLInputElement;
    fireEvent.change(priceInput, { target: { value: "" } });
    typeInto(priceInput, "0.0000025");

    expect(
      screen.getAllByLabelText(/^Usage type \d+$/).map((input) => {
        return (input as HTMLInputElement).value;
      }),
    ).toEqual(["text_input_cached", "text_output", "audio"]);
    expect(priceInput.value).toBe("0.0000025");
  });

  it("renaming a usage type keeps the other rows and the custom tier's price", async () => {
    openEditDialog();

    const firstUsageType = usageTypeInput("text_input");
    fireEvent.change(firstUsageType, { target: { value: "" } });
    typeInto(firstUsageType, "text_input_cached");

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(upsertMutateAsync).toHaveBeenCalledTimes(1));
    expect(upsertMutateAsync.mock.calls[0][0].pricingTiers).toEqual([
      {
        name: "Standard",
        isDefault: true,
        priority: 0,
        conditions: [],
        prices: {
          text_input_cached: 0.000004,
          text_output: 0.000016,
          audio: 0.00003,
        },
      },
      {
        name: "Long context",
        isDefault: false,
        priority: 1,
        conditions: modelData.pricingTiers[1].conditions,
        // The rename must not zero this tier's price for the renamed key.
        prices: {
          text_input_cached: 0.000008,
          text_output: 0.000032,
          audio: 0.00006,
        },
      },
    ]);
  });

  it("shows inline errors instead of silently refusing to submit", async () => {
    openEditDialog();

    const firstUsageType = usageTypeInput("text_input");
    fireEvent.change(firstUsageType, { target: { value: "audio" } });
    fireEvent.change(
      screen.getByLabelText("Standard price for text_output") as HTMLElement,
      { target: { value: "" } },
    );

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText('Duplicate usage type "audio"'),
    ).toBeTruthy();
    expect(screen.getByText("Enter a price of 0 or more")).toBeTruthy();
    expect(upsertMutateAsync).not.toHaveBeenCalled();
  });
});
