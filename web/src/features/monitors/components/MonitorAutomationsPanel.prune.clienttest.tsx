import { fireEvent, render, screen } from "@testing-library/react";

const automationRow = {
  id: "auto-1",
  name: "Ping webhook",
  trigger: { id: "trig-1" },
  action: { type: "WEBHOOK" },
};

const useQueryMock = vi.fn();

vi.mock("@/src/utils/api", () => ({
  api: {
    automations: {
      getAutomations: {
        useQuery: () => useQueryMock(),
      },
    },
  },
}));

vi.mock("next/router", () => ({
  useRouter: () => ({ asPath: "/", push: vi.fn() }),
}));

import { MonitorAutomationsPanel } from "./MonitorAutomationsPanel";

describe("MonitorAutomationsPanel stale-id pruning", () => {
  it("does not write back while the query is loading", () => {
    useQueryMock.mockReturnValue({ data: undefined, isPending: true });
    const onTriggerIdsChange = vi.fn();
    render(
      <MonitorAutomationsPanel
        projectId="p1"
        triggerIds={["trig-stale"]}
        onTriggerIdsChange={onTriggerIdsChange}
      />,
    );
    expect(onTriggerIdsChange).not.toHaveBeenCalled();
  });

  it("hides a stale ID on load without writing back", () => {
    useQueryMock.mockReturnValue({ data: [automationRow], isPending: false });
    const onTriggerIdsChange = vi.fn();
    render(
      <MonitorAutomationsPanel
        projectId="p1"
        triggerIds={["trig-1", "trig-stale"]}
        onTriggerIdsChange={onTriggerIdsChange}
      />,
    );
    expect(onTriggerIdsChange).not.toHaveBeenCalled();
  });

  it("drops the stale ID when the user toggles a row", () => {
    useQueryMock.mockReturnValue({ data: [automationRow], isPending: false });
    const onTriggerIdsChange = vi.fn();
    render(
      <MonitorAutomationsPanel
        projectId="p1"
        triggerIds={["trig-1", "trig-stale"]}
        onTriggerIdsChange={onTriggerIdsChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /ping webhook/i }));
    expect(onTriggerIdsChange).toHaveBeenCalledTimes(1);
    expect(onTriggerIdsChange).toHaveBeenCalledWith([]);
  });
});
