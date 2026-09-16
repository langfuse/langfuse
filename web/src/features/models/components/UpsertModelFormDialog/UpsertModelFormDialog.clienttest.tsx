import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";

import { type GetModelResult } from "@/src/features/models/validation";
import { ModelBadge } from "@/src/features/traces/components/ObservationDetailView/components/ModelBadge";
import { UpsertModelFormDialog } from "./UpsertModelFormDialog";

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

const defaultTier = {
  id: "tier-default",
  name: "Standard",
  isDefault: true,
  priority: 0,
  conditions: [],
  prices: { text_input: 0.000004, text_output: 0.000016, audio: 0.00003 },
};

const longContextTier = {
  id: "tier-long",
  name: "Long context",
  isDefault: false,
  priority: 1,
  conditions: [
    {
      usageDetailPattern: "^text_input",
      operator: "gt" as const,
      value: 128000,
      caseSensitive: false,
    },
  ],
  prices: { text_input: 0.000008, text_output: 0.000032, audio: 0.00006 },
};

const fastModeTier = {
  id: "tier-priority",
  name: "Fast mode",
  isDefault: false,
  priority: 1,
  conditions: [
    {
      source: "model_parameters" as const,
      key: "service_tier",
      operator: "in" as const,
      values: ["fast", "priority"],
    },
  ],
  prices: { text_input: 0.0000125, text_output: 0.000075, audio: 0.00009 },
};

const modelData = (
  pricingTiers: GetModelResult["pricingTiers"],
): GetModelResult => ({
  id: "model-1",
  projectId: "p1",
  modelName: "gpt-realtime-2.1",
  matchPattern: "(?i)^(gpt-realtime-2.1)$",
  tokenizerConfig: null,
  tokenizerId: null,
  pricingTiers,
});

/** Types character by character, as a user does — one change event per key. */
const typeInto = (input: HTMLInputElement, text: string) => {
  for (const character of text) {
    fireEvent.change(input, { target: { value: input.value + character } });
  }
};

const retype = (input: HTMLInputElement, text: string) => {
  fireEvent.change(input, { target: { value: "" } });
  typeInto(input, text);
};

// Queried by placeholder, so these tests do not depend on the editor's markup.
const usageTypeInputs = () =>
  screen.getAllByPlaceholderText(
    "Key (e.g. input, output)",
  ) as HTMLInputElement[];
const priceInputs = () =>
  screen.getAllByPlaceholderText("Price per unit") as HTMLInputElement[];

const openEditDialog = (pricingTiers: GetModelResult["pricingTiers"]) => {
  render(
    <UpsertModelFormDialog
      action="edit"
      projectId="p1"
      modelData={modelData(pricingTiers)}
    >
      <button>Open editor</button>
    </UpsertModelFormDialog>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Open editor" }));
};

const openCloneDialog = (matchPattern: string) => {
  render(
    <UpsertModelFormDialog
      action="clone"
      projectId="p1"
      modelData={{ ...modelData([defaultTier]), matchPattern }}
    >
      <button>Open editor</button>
    </UpsertModelFormDialog>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Open editor" }));
};

const submit = () =>
  fireEvent.click(screen.getByRole("button", { name: /^(Save|Submit)$/ }));

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

  it("keeps an unlinked model badge intact as the dialog trigger", () => {
    render(
      <ModelBadge
        model="claude-sonnet-4-5"
        internalModelId={null}
        projectId="p1"
        usageDetails={undefined}
      />,
    );

    const trigger = screen.getByTitle("Create model definition");
    const label = within(trigger).getByText("claude-sonnet-4-5");

    expect(trigger.tagName).toBe("BUTTON");
    expect(label.parentElement).toHaveClass("bg-tertiary");
    expect(label.parentElement?.querySelector("svg")).not.toBeNull();
  });

  it("keeps every keystroke of a usage type that extends an existing one", () => {
    openEditDialog([defaultTier]);

    // Typing `text_input_cached` passes through the existing key `text_input`.
    retype(usageTypeInputs()[2], "text_input_cached");
    retype(priceInputs()[2], "0.0000025");

    expect(usageTypeInputs().map((input) => input.value)).toEqual([
      "text_input",
      "text_output",
      "text_input_cached",
    ]);
    expect(priceInputs()[2].value).toBe("0.0000025");
  });

  it("renaming a usage type keeps the other rows and the custom tier's price", async () => {
    openEditDialog([defaultTier, longContextTier]);

    retype(usageTypeInputs()[0], "text_input_cached");
    submit();

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
        conditions: [
          {
            usageDetailPattern: "^text_input",
            operator: "gt",
            value: 128000,
            caseSensitive: false,
          },
        ],
        // The rename must not zero this tier's price for the renamed key.
        prices: {
          text_input_cached: 0.000008,
          text_output: 0.000032,
          audio: 0.00006,
        },
      },
    ]);
  });

  it("preserves model parameter membership conditions when saving", async () => {
    openEditDialog([defaultTier, fastModeTier]);
    submit();

    await waitFor(() => expect(upsertMutateAsync).toHaveBeenCalledTimes(1));
    expect(
      upsertMutateAsync.mock.calls[0][0].pricingTiers[1].conditions,
    ).toEqual(fastModeTier.conditions);
  });

  it("renaming a clone keeps a custom match pattern but follows a generated one", () => {
    const custom = String.raw`(?i)^(gpt-realtime-2\.\d+)$`;
    openCloneDialog(custom);
    typeInto(
      document.querySelector('input[name="modelName"]') as HTMLInputElement,
      "-mine",
    );
    expect(
      (document.querySelector('input[name="matchPattern"]') as HTMLInputElement)
        .value,
    ).toBe(custom);

    cleanup();
    openCloneDialog("(?i)^(gpt-realtime-2.1)$");
    typeInto(
      document.querySelector('input[name="modelName"]') as HTMLInputElement,
      "-mine",
    );
    expect(
      (document.querySelector('input[name="matchPattern"]') as HTMLInputElement)
        .value,
    ).toBe("(?i)^(gpt-realtime-2.1-mine)$");
  });

  it("saving is a checkpoint: saved values are clean, an in-flight edit is not", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);

    // Saved values become the new baseline: closing needs no confirmation.
    openEditDialog([defaultTier]);
    retype(priceInputs()[0], "0.000009");
    await act(async () => submit());
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(confirm).not.toHaveBeenCalled();
    expect(document.querySelector('div[role="dialog"]')).toBeNull();

    cleanup();

    // An edit typed while the save is in flight was never submitted, so it
    // stays unsaved work and the discard guard still fires for it.
    let settleSave: (model: {
      id: string;
      modelName: string;
    }) => void = () => {};
    upsertMutateAsync.mockImplementationOnce(
      () => new Promise((resolve) => (settleSave = resolve)),
    );
    openEditDialog([defaultTier]);
    retype(priceInputs()[0], "0.000009");
    await act(async () => submit());
    retype(priceInputs()[0], "0.000011");
    await act(async () => {
      settleSave({ id: "model-1", modelName: "gpt-realtime-2.1" });
    });

    expect(priceInputs()[0].value).toBe("0.000011");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(document.querySelector('div[role="dialog"]')).not.toBeNull();
    confirm.mockRestore();
  });

  it("shows inline errors instead of silently refusing to submit", async () => {
    openEditDialog([defaultTier]);

    fireEvent.change(usageTypeInputs()[0], { target: { value: "audio" } });
    fireEvent.change(priceInputs()[1], { target: { value: "" } });
    submit();

    expect(
      await screen.findByText('Duplicate usage type "audio"'),
    ).toBeTruthy();
    expect(screen.getByText("Enter a price of 0 or more")).toBeTruthy();
    expect(upsertMutateAsync).not.toHaveBeenCalled();
  });
});
