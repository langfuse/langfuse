import { ChatMessageRole, ChatMessageType } from "@langfuse/shared";

import { createMessageSearchController } from "./controller";

describe("message search controller", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  const commitQuery = (
    controller: ReturnType<typeof createMessageSearchController>,
    query: string,
  ) => {
    controller.setQueryInput(query);
    jest.runAllTimers();
    return controller.getSnapshot().matches;
  };

  it("finds all occurrences of a query", () => {
    const controller = createMessageSearchController(["page-1"]);

    controller.registerPageMessages("page-1", [
      {
        id: "message-1",
        type: ChatMessageType.System,
        role: ChatMessageRole.System,
        content:
          "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ",
      },
      {
        id: "message-2",
        type: ChatMessageType.User,
        role: ChatMessageRole.User,
        content:
          "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ",
      },
    ]);

    expect(commitQuery(controller, "Lorem")).toEqual([
      expect.objectContaining({
        messageId: "message-1",
        from: 0,
        to: 5,
      }),
      expect.objectContaining({
        messageId: "message-2",
        from: 0,
        to: 5,
      }),
    ]);

    expect(commitQuery(controller, "dolor")).toEqual([
      expect.objectContaining({
        messageId: "message-1",
        from: 12,
        to: 17,
      }),
      expect.objectContaining({
        messageId: "message-1",
        from: 103,
        to: 108,
      }),
      expect.objectContaining({
        messageId: "message-2",
        from: 12,
        to: 17,
      }),
      expect.objectContaining({
        messageId: "message-2",
        from: 103,
        to: 108,
      }),
    ]);
  });

  // Regression test for https://github.com/langfuse/langfuse/issues/13002
  it("matches fullwidth and halfwidth variants consistently", () => {
    const controller = createMessageSearchController(["page-1"]);

    controller.registerPageMessages("page-1", [
      {
        id: "message-1",
        type: ChatMessageType.System,
        role: ChatMessageRole.System,
        content:
          "Langfuse is an LLM observability platform. Ｌａｎｇｆｕｓｅ is also great.",
      },
    ]);

    expect(commitQuery(controller, "Ｌａｎｇｆｕｓｅ")).toEqual([
      expect.objectContaining({ from: 0, to: 8 }),
      expect.objectContaining({ from: 43, to: 51 }),
    ]);
    expect(commitQuery(controller, "Langfuse")).toEqual([
      expect.objectContaining({ from: 0, to: 8 }),
      expect.objectContaining({ from: 43, to: 51 }),
    ]);
    expect(commitQuery(controller, "langfuse")).toEqual([
      expect.objectContaining({ from: 0, to: 8 }),
      expect.objectContaining({ from: 43, to: 51 }),
    ]);
  });

  // Regression test for https://github.com/langfuse/langfuse/issues/13002
  it("returns original document offsets for compatibility character matches", () => {
    const controller = createMessageSearchController(["page-1"]);

    controller.registerPageMessages("page-1", [
      {
        id: "message-1",
        type: ChatMessageType.System,
        role: ChatMessageRole.System,
        content: "高さ180㌢の棚",
      },
    ]);

    expect(commitQuery(controller, "センチ")).toEqual([
      expect.objectContaining({ from: 5, to: 6 }),
    ]);
  });

  it("preserves leading and trailing whitespace in literal queries", () => {
    const controller = createMessageSearchController(["page-1"]);

    controller.registerPageMessages("page-1", [
      {
        id: "message-1",
        type: ChatMessageType.System,
        role: ChatMessageRole.System,
        content: " foo foo ",
      },
    ]);

    expect(commitQuery(controller, " foo")).toEqual([
      expect.objectContaining({ from: 0, to: 4 }),
      expect.objectContaining({ from: 4, to: 8 }),
    ]);
    expect(controller.getSnapshot().query).toBe(" foo");

    controller.setQueryInput("foo ");
    controller.nextMatch();

    expect(controller.getSnapshot().query).toBe("foo ");
    expect(controller.getSnapshot().matches).toEqual([
      expect.objectContaining({ from: 1, to: 5 }),
      expect.objectContaining({ from: 5, to: 9 }),
    ]);
  });

  it("clears whitespace-only input on blur", () => {
    const controller = createMessageSearchController(["page-1"]);

    controller.registerPageMessages("page-1", [
      {
        id: "message-1",
        type: ChatMessageType.System,
        role: ChatMessageRole.System,
        content: "a   b",
      },
    ]);

    controller.setQueryInput("   ");
    jest.runAllTimers();

    expect(controller.getSnapshot().queryInput).toBe("   ");
    expect(controller.getSnapshot().query).toBe("   ");
    expect(controller.getSnapshot().matches).toEqual([
      expect.objectContaining({ from: 1, to: 4 }),
    ]);

    controller.blurQueryInput();

    expect(controller.getSnapshot().queryInput).toBe("");
    expect(controller.getSnapshot().query).toBe("");
    expect(controller.getSnapshot().matches).toEqual([]);
  });
});
