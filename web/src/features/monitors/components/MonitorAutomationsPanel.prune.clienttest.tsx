import { render } from "@testing-library/react";

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

describe("MonitorAutomationsPanel auto-prune", () => {
  it("does not prune while the query is loading", () => {
    useQueryMock.mockReturnValue({ data: undefined, isSuccess: false });
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

  it("prunes a stale ID once loaded, calling onChange once with the pruned array", () => {
    useQueryMock.mockReturnValue({ data: [automationRow], isSuccess: true });
    const onTriggerIdsChange = vi.fn();
    render(
      <MonitorAutomationsPanel
        projectId="p1"
        triggerIds={["trig-1", "trig-stale"]}
        onTriggerIdsChange={onTriggerIdsChange}
      />,
    );
    expect(onTriggerIdsChange).toHaveBeenCalledTimes(1);
    expect(onTriggerIdsChange).toHaveBeenCalledWith(["trig-1"]);
  });

  it("does not write back when the selection already matches the live set", () => {
    useQueryMock.mockReturnValue({ data: [automationRow], isSuccess: true });
    const onTriggerIdsChange = vi.fn();
    render(
      <MonitorAutomationsPanel
        projectId="p1"
        triggerIds={["trig-1"]}
        onTriggerIdsChange={onTriggerIdsChange}
      />,
    );
    expect(onTriggerIdsChange).not.toHaveBeenCalled();
  });
});
