import { useState } from "react";
import { expect, fn, userEvent } from "storybook/test";
import preview from "../../../../.storybook/preview";
import { getTraceScopeTabs } from "@/src/features/traces/fns/getTraceScopeTabs";
import { getTraceScopeQuery } from "@/src/features/traces/fns/getTraceScopeQuery";
import { PeekHeader } from "./PeekHeader";

const meta = preview.meta({ component: PeekHeader });

export const Session = meta.story({
  args: {
    itemType: "SESSION",
    title: "session-1",
    itemId: "trace-1",
    titleTabs: getTraceScopeTabs({
      value: "session",
      canSelectSession: true,
      onValueChange: fn(),
    }),
    onClose: fn(),
    openInNewTab: fn(),
  },
});

export const SessionUnavailable = meta.story({
  name: "(Test) Session Unavailable",
  args: {
    itemType: "TRACE",
    title: "trace-1",
    itemId: "trace-1",
    titleTabs: getTraceScopeTabs({
      value: "trace",
      canSelectSession: false,
      onValueChange: fn(),
    }),
    onClose: fn(),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("tab", { name: "Session" })).toBeDisabled();
  },
});

export const TestScopeSwitch = meta.story({
  name: "(Test) Switch Scope And Clear Foreign Selection",
  args: {
    itemType: "SESSION",
    title: "session-1",
    itemId: "trace-1",
    onClose: fn(),
  },
  render: (args) => {
    const [query, setQuery] = useState<
      Record<string, string | string[] | undefined>
    >({ aggregation: "session", observation: "foreign" });
    const isSession = query.aggregation === "session";
    return (
      <>
        <PeekHeader
          {...args}
          title={isSession ? "session-1" : "trace-1"}
          itemType={isSession ? "SESSION" : "TRACE"}
          titleTabs={getTraceScopeTabs({
            value: isSession ? "session" : "trace",
            canSelectSession: true,
            onValueChange: (next) =>
              setQuery(getTraceScopeQuery(query, next, [{ id: "anchor" }])),
          })}
        />
        <output aria-label="Selected observation">
          {query.observation ?? "none"}
        </output>
      </>
    );
  },
  play: async ({ canvas }) => {
    const tabs = canvas.getByRole("tablist", { name: "Trace detail scope" });
    const title = canvas.getByText("session-1");
    await expect(tabs.compareDocumentPosition(title)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    await expect(canvas.getByRole("tab", { name: "Session" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await userEvent.click(canvas.getByRole("tab", { name: "Trace" }));
    await expect(canvas.getByText("trace-1")).toBeVisible();
    await expect(canvas.getByRole("tab", { name: "Trace" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(
      canvas.getByRole("status", { name: "Selected observation" }),
    ).toHaveTextContent("none");
    await userEvent.click(canvas.getByRole("tab", { name: "Session" }));
    await expect(canvas.getByText("session-1")).toBeVisible();
    await expect(canvas.getByRole("tab", { name: "Session" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  },
});
