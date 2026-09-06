import { fireEvent, screen } from "@testing-library/react";
import { renderMonitorWithIntl } from "../test-utils";

import { type Monitor } from "@langfuse/shared/monitors";

vi.mock("@/src/components/deleteButton", () => ({
  DeleteMonitorButton: (props: { itemId: string }) => (
    <button type="button" data-testid="delete-monitor">
      delete {props.itemId}
    </button>
  ),
}));

import { __test } from "./MonitorsTable";

const { MonitorRowActions } = __test;

const PROJECT_ID = "proj_test123";

/** monitorRow builds a minimal monitor row with the given id and status. */
const monitorRow = (status: Monitor["status"]): Monitor =>
  ({ id: "mon-1", status }) as Monitor;

describe("MonitorRowActions", () => {
  it("write access: edit links to alerts/<id> and pause click toggles status", () => {
    const onToggleStatus = vi.fn();
    renderMonitorWithIntl(
      <MonitorRowActions
        monitor={monitorRow("ACTIVE")}
        projectId={PROJECT_ID}
        hasCUDAccess={true}
        collapsed={false}
        isStatusPending={false}
        onToggleStatus={onToggleStatus}
      />,
    );

    const editLink = screen.getByRole("link");
    expect(editLink.getAttribute("href")).toBe(
      `/project/${PROJECT_ID}/alerts/mon-1`,
    );

    fireEvent.click(screen.getByRole("button", { name: /pause/i }));
    expect(onToggleStatus).toHaveBeenCalledTimes(1);
  });

  it("paused alert: shows a Resume control", () => {
    renderMonitorWithIntl(
      <MonitorRowActions
        monitor={monitorRow("PAUSED")}
        projectId={PROJECT_ID}
        hasCUDAccess={true}
        collapsed={false}
        isStatusPending={false}
        onToggleStatus={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /resume/i })).toBeInTheDocument();
  });

  it("read-only access: pause and edit controls are disabled", () => {
    renderMonitorWithIntl(
      <MonitorRowActions
        monitor={monitorRow("ACTIVE")}
        projectId={PROJECT_ID}
        hasCUDAccess={false}
        collapsed={false}
        isStatusPending={false}
        onToggleStatus={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /pause/i })).toBeDisabled();
    expect(screen.getByRole("link")).toHaveAttribute("disabled");
  });

  it("collapsed: actions hide behind a kebab menu trigger", () => {
    renderMonitorWithIntl(
      <MonitorRowActions
        monitor={monitorRow("ACTIVE")}
        projectId={PROJECT_ID}
        hasCUDAccess={true}
        collapsed={true}
        isStatusPending={false}
        onToggleStatus={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: /alert actions/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
