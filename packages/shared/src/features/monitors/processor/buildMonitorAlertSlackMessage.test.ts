import { describe, it, expect } from "vitest";

import { type MonitorAlert } from "../types";
import { buildMonitorAlertSlackMessage } from "./buildMonitorAlertSlackMessage";

/** mockMonitorAlert is the ALERT each case overrides. */
const mockMonitorAlert: MonitorAlert = {
  monitorId: "mon_01",
  projectId: "proj_01",
  permalink: "https://cloud.langfuse.com/project/proj_01/monitors/mon_01",
  message: {
    title: "High error rate",
    body: "**count(observations.value)** is **above** `100`",
  },
  severity: "ALERT",
  timestamp: new Date("2026-05-18T12:01:00.000Z"),
  fromTimestamp: new Date("2026-05-18T11:55:30.000Z"),
  toTimestamp: new Date("2026-05-18T12:00:30.000Z"),
  view: "observations",
  filters: [],
  window: "5m",
};

describe("buildMonitorAlertSlackMessage", () => {
  it("ALERT: red attachment; linked title; body mrkdwn; timestamp; neutral view button", () => {
    const { blocks, attachments } =
      buildMonitorAlertSlackMessage(mockMonitorAlert);
    expect(blocks).toEqual([]);
    expect(attachments).toHaveLength(1);
    expect(attachments![0].color).toBe("#dc3545");
    expect(attachments![0].fallback).toBe("High error rate");
    const inner = attachments![0].blocks!;
    expect(inner[0]).toMatchObject({
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*<https://cloud.langfuse.com/project/proj_01/monitors/mon_01|High error rate>*",
      },
    });
    expect(inner[1]).toMatchObject({
      type: "section",
      text: { type: "mrkdwn" },
    });
    expect(inner[1].text.text).toContain("*count(observations.value)*");
    expect(inner[2]).toMatchObject({ type: "context" });
    expect(inner[2].elements[0].text).toContain("2026-05-18T12:01:00.000Z");
    expect(inner[3]).toMatchObject({ type: "actions" });
    expect(inner[3].elements[0]).toMatchObject({
      type: "button",
      url: "https://cloud.langfuse.com/project/proj_01/monitors/mon_01",
    });
    expect(inner[3].elements[0].style).toBeUndefined();
  });

  it.each([
    ["WARNING", "#ffc107"],
    ["OK", "#28a745"],
    ["NO_DATA", "#6c757d"],
    ["UNKNOWN", "#6c757d"],
    ["PAUSED", "#6c757d"],
  ] as const)("%s: linked title, attachment color %s", (severity, color) => {
    const { attachments } = buildMonitorAlertSlackMessage({
      ...mockMonitorAlert,
      severity,
    });
    expect(attachments![0].color).toBe(color);
    expect(attachments![0].blocks![0].text.text).toContain("High error rate");
  });

  it("title links to the permalink", () => {
    const { attachments } = buildMonitorAlertSlackMessage(mockMonitorAlert);
    expect(attachments![0].blocks![0].text.text).toBe(
      "*<https://cloud.langfuse.com/project/proj_01/monitors/mon_01|High error rate>*",
    );
  });

  it("renders a plain bold title and omits the button when permalink is absent", () => {
    const { attachments } = buildMonitorAlertSlackMessage({
      ...mockMonitorAlert,
      permalink: undefined,
    });
    const inner = attachments![0].blocks!;
    expect(inner[0].text.text).toBe("*High error rate*");
    expect(inner.some((b: any) => b.type === "actions")).toBe(false);
    expect(inner.some((b: any) => b.type === "context")).toBe(true);
  });
});
