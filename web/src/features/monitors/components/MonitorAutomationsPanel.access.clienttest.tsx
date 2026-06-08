import { fireEvent, render, screen } from "@testing-library/react";

const automationRow = {
  id: "auto-1",
  name: "Ping webhook",
  trigger: { id: "trig-1" },
  action: { type: "WEBHOOK" },
};

vi.mock("@/src/utils/api", () => ({
  api: {
    automations: {
      getAutomations: {
        useQuery: () => ({ data: [automationRow], isSuccess: true }),
      },
    },
  },
}));

vi.mock("next/router", () => ({
  useRouter: () => ({ asPath: "/", push: vi.fn() }),
}));

import { MonitorAutomationsPanel } from "./MonitorAutomationsPanel";

describe("MonitorAutomationsPanel access gating", () => {
  it("read-only access: clicking a row does not toggle the trigger", () => {
    const onTriggerIdsChange = vi.fn();
    render(
      <MonitorAutomationsPanel
        projectId="p1"
        hasAccess={false}
        triggerIds={[]}
        onTriggerIdsChange={onTriggerIdsChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /ping webhook/i }));
    expect(onTriggerIdsChange).not.toHaveBeenCalled();
  });

  it("write access: clicking a row toggles the trigger", () => {
    const onTriggerIdsChange = vi.fn();
    render(
      <MonitorAutomationsPanel
        projectId="p1"
        hasAccess={true}
        triggerIds={[]}
        onTriggerIdsChange={onTriggerIdsChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /ping webhook/i }));
    expect(onTriggerIdsChange).toHaveBeenCalledTimes(1);
  });
});
