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

describe("MonitorAutomationsPanel toggle immutability", () => {
  it("does not mutate the memoized set: toggling the same unselected row twice reports it selected both times", () => {
    useQueryMock.mockReturnValue({ data: [automationRow], isPending: false });
    const onTriggerIdsChange = vi.fn();
    render(
      <MonitorAutomationsPanel
        projectId="p1"
        triggerIds={[]}
        onTriggerIdsChange={onTriggerIdsChange}
      />,
    );
    const row = screen.getByRole("button", { name: /ping webhook/i });
    fireEvent.click(row);
    fireEvent.click(row);
    expect(onTriggerIdsChange).toHaveBeenNthCalledWith(1, ["trig-1"]);
    expect(onTriggerIdsChange).toHaveBeenNthCalledWith(2, ["trig-1"]);
  });
});
