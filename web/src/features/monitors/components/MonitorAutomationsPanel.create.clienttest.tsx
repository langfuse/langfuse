import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const existingRow = {
  id: "auto-1",
  name: "Ping webhook",
  trigger: { id: "trig-1" },
  action: { type: "WEBHOOK" },
};
const createdRow = {
  id: "auto-2",
  name: "Deploy hook",
  trigger: { id: "trig-2" },
  action: { type: "WEBHOOK" },
};

/** automations stands in for the server list; a save flips it the way invalidation would. */
let automations: (typeof existingRow)[] = [];

/** gateFetch defers the post-create list read so a test can interleave user input. */
let gateFetch: Promise<unknown> | undefined;

vi.mock("@/src/utils/api", () => ({
  api: {
    automations: {
      getAutomations: {
        useQuery: () => ({ data: automations, isPending: false }),
      },
    },
    useUtils: () => ({
      automations: {
        getAutomations: {
          fetch: vi.fn(async () => {
            await gateFetch;
            return automations;
          }),
        },
      },
    }),
  },
}));

type SuccessHandler = (
  automationId?: string,
  webhookSecret?: string,
  actionType?: "WEBHOOK" | "GITHUB_DISPATCH",
) => void;

/** stubSave stands in for the real form, whose contract with the panel is "prefill in, onSuccess out". */
let stubSave: (onSuccess: SuccessHandler) => void;

vi.mock("@/src/features/automations/components/automationForm", () => ({
  AutomationForm: ({ onSuccess }: { onSuccess: SuccessHandler }) => (
    <button onClick={() => stubSave(onSuccess)}>stub save</button>
  ),
}));

import { MonitorAutomationsPanel } from "./MonitorAutomationsPanel";

/** openCreateDialog opens the "+ Automation" menu and picks one of its items. */
const openCreateDialog = async (item: RegExp) => {
  fireEvent.keyDown(screen.getByRole("button", { name: /^automation$/i }), {
    key: "Enter",
  });
  fireEvent.click(await screen.findByRole("menuitem", { name: item }));
};

describe("MonitorAutomationsPanel automation creation", () => {
  beforeEach(() => {
    gateFetch = undefined;
  });

  it("creates in place and selects the new trigger, never linking away from the monitor form", async () => {
    automations = [existingRow];
    stubSave = (onSuccess) => {
      automations = [existingRow, createdRow];
      onSuccess("auto-2");
    };
    const onTriggerIdsChange = vi.fn();
    render(
      <MonitorAutomationsPanel
        projectId="p1"
        triggerIds={["trig-1"]}
        onTriggerIdsChange={onTriggerIdsChange}
      />,
    );

    await openCreateDialog(/new automation/i);
    // Navigating to the automations page unmounted the monitor form (LFE-10982).
    expect(document.querySelector('a[href*="/automations"]')).toBeNull();

    fireEvent.click(await screen.findByRole("button", { name: /stub save/i }));

    await waitFor(() =>
      expect(onTriggerIdsChange).toHaveBeenCalledWith(["trig-1", "trig-2"]),
    );
  });

  it("keeps the open dialog through the empty-state-to-list switch, so the once-only webhook secret still shows", async () => {
    automations = [];
    stubSave = (onSuccess) => onSuccess("auto-2", "whsec_stub", "WEBHOOK");
    const onTriggerIdsChange = vi.fn();
    // A fresh element per render: React bails out of re-rendering an identical one.
    const panel = () => (
      <MonitorAutomationsPanel
        projectId="p1"
        triggerIds={[]}
        onTriggerIdsChange={onTriggerIdsChange}
      />
    );
    const { rerender } = render(panel());

    await openCreateDialog(/^webhook$/i);
    // The create invalidates the list, so the first automation lands while the
    // dialog is still open; that must not remount the dialog's owner.
    automations = [createdRow];
    rerender(panel());

    fireEvent.click(await screen.findByRole("button", { name: /stub save/i }));
    expect(await screen.findByText("whsec_stub")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /saved the secret/i }));
    await waitFor(() =>
      expect(onTriggerIdsChange).toHaveBeenCalledWith(["trig-2"]),
    );
  });

  it("keeps a selection made while the post-create list read is still in flight", async () => {
    automations = [existingRow];
    stubSave = (onSuccess) => {
      automations = [existingRow, createdRow];
      onSuccess("auto-2");
    };
    let releaseFetch = () => {};
    gateFetch = new Promise<void>((resolve) => {
      releaseFetch = resolve;
    });
    const onTriggerIdsChange = vi.fn();
    const panel = (triggerIds: string[]) => (
      <MonitorAutomationsPanel
        projectId="p1"
        triggerIds={triggerIds}
        onTriggerIdsChange={onTriggerIdsChange}
      />
    );
    const { rerender } = render(panel([]));

    await openCreateDialog(/new automation/i);
    fireEvent.click(await screen.findByRole("button", { name: /stub save/i }));

    // The user ticks another automation before the read resolves.
    rerender(panel(["trig-1"]));
    releaseFetch();

    await waitFor(() =>
      expect(onTriggerIdsChange).toHaveBeenCalledWith(["trig-1", "trig-2"]),
    );
  });
});
