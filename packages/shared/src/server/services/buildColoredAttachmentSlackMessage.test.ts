import { describe, it, expect } from "vitest";

import { buildColoredAttachmentSlackMessage } from "./buildColoredAttachmentSlackMessage";

describe("buildColoredAttachmentSlackMessage", () => {
  const base = {
    color: "#dc3545",
    title: "Something failed",
    body: "A **thing** went wrong.",
    timestamp: new Date("2026-07-08T00:00:00.000Z"),
    url: "https://cloud.langfuse.com/x",
  };

  it("nests title, body and timestamp inside a single color-barred attachment", () => {
    const message = buildColoredAttachmentSlackMessage(base);
    expect(message.blocks).toEqual([]);
    expect(message.attachments).toHaveLength(1);
    const attachment = message.attachments![0];
    expect(attachment.color).toBe("#dc3545");
    expect(attachment.fallback).toBe("Something failed");
    const serialized = JSON.stringify(attachment.blocks);
    expect(serialized).toContain("Something failed");
    expect(serialized).toContain(base.timestamp.toISOString());
  });

  it("renders the title as a link and adds a deep-link button when a url is set", () => {
    const serialized = JSON.stringify(
      buildColoredAttachmentSlackMessage(base).attachments![0].blocks,
    );
    expect(serialized).toContain(`<${base.url}|Something failed>`);
    expect(serialized).toContain("View in Langfuse");
  });

  it("omits the link and button when no url is provided", () => {
    const { url: _url, ...noUrl } = base;
    const serialized = JSON.stringify(
      buildColoredAttachmentSlackMessage(noUrl).attachments![0].blocks,
    );
    expect(serialized).not.toContain("View in Langfuse");
    expect(serialized).toContain("*Something failed*");
  });

  it("renders a labeled secondary button after the primary when secondaryUrl is set", () => {
    const blocks = buildColoredAttachmentSlackMessage({
      ...base,
      secondaryUrl: "https://cloud.langfuse.com/y?dateRange=1-2",
      secondaryLabel: "View traces",
    }).attachments![0].blocks!;
    const actions = blocks.find((b: any) => b.type === "actions");
    expect(actions.elements).toHaveLength(2);
    expect(actions.elements[0]).toMatchObject({
      type: "button",
      text: { text: "View in Langfuse" },
      url: base.url,
    });
    expect(actions.elements[1]).toMatchObject({
      type: "button",
      text: { text: "View traces" },
      url: "https://cloud.langfuse.com/y?dateRange=1-2",
    });
  });

  it("defaults the secondary button label to 'View data'", () => {
    const blocks = buildColoredAttachmentSlackMessage({
      ...base,
      secondaryUrl: "https://cloud.langfuse.com/y?dateRange=1-2",
    }).attachments![0].blocks!;
    const actions = blocks.find((b: any) => b.type === "actions");
    expect(actions.elements[1].text.text).toBe("View data");
  });

  it("omits the secondary button when secondaryUrl is absent", () => {
    const blocks =
      buildColoredAttachmentSlackMessage(base).attachments![0].blocks!;
    const actions = blocks.find((b: any) => b.type === "actions");
    expect(actions.elements).toHaveLength(1);
  });
});
