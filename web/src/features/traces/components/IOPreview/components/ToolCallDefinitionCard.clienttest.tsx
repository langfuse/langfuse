/* eslint-disable @repo/prefer-stories-over-client-tests */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { vi } from "vitest";

import {
  ToolCallDefinitionCard,
  type ToolDefinition,
} from "./ToolCallDefinitionCard";
import type { ToolCallInvocation } from "../../../hooks/useChatMLParser";

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();

  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key) => store.get(key) ?? null,
    key: (index) => Array.from(store.keys())[index] ?? null,
    removeItem: (key) => {
      store.delete(key);
    },
    setItem: (key, value) => {
      store.set(key, value);
    },
  };
}

const makeTool = (name: string): ToolDefinition => ({
  name,
  description: `${name} description`,
  parameters: { type: "object" },
});

function renderTools({
  calledToolCount,
  notCalledToolCount,
}: {
  calledToolCount: number;
  notCalledToolCount: number;
}) {
  const calledTools = Array.from({ length: calledToolCount }, (_, index) =>
    makeTool(`called_tool_${index + 1}`),
  );
  const notCalledTools = Array.from(
    { length: notCalledToolCount },
    (_, index) => makeTool(`not_called_tool_${index + 1}`),
  );
  const tools = [...calledTools, ...notCalledTools];
  const toolCallCounts = new Map<string, number>();
  const toolCallsByName = new Map<string, ToolCallInvocation[]>();

  calledTools.forEach((tool, index) => {
    toolCallCounts.set(tool.name, 1);
    toolCallsByName.set(tool.name, [
      {
        id: `call-${index + 1}`,
        name: tool.name,
        arguments: "{}",
        invocationNumber: index + 1,
      },
    ]);
  });

  return render(
    <ToolCallDefinitionCard
      tools={tools}
      toolCallCounts={toolCallCounts}
      toolCallsByName={toolCallsByName}
    />,
  );
}

// Row buttons are named "N.<tool name>"; strip the number and match the name exactly.
const rowFor = (toolName: string) =>
  screen.queryByRole("button", {
    name: (accessibleName) =>
      accessibleName.replace(/^\d+\.\s*/, "") === toolName,
  });
const rowNumberOf = (toolName: string) =>
  within(rowFor(toolName)!).getByText(/^\d+\.$/).textContent;

describe("ToolCallDefinitionCard", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createMemoryStorage());
    vi.stubGlobal("sessionStorage", createMemoryStorage());
  });

  it("starts long lists collapsed and keeps the user's choice for the session", () => {
    const first = renderTools({ calledToolCount: 2, notCalledToolCount: 4 });
    const header = screen.getByRole("button", { name: "Tools" });

    expect(header).toHaveAttribute("aria-expanded", "false");
    expect(rowFor("called_tool_1")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();

    fireEvent.click(header);
    expect(header).toHaveAttribute("aria-expanded", "true");
    expect(rowFor("called_tool_1")).toBeInTheDocument();
    first.unmount();

    renderTools({ calledToolCount: 2, notCalledToolCount: 4 });
    expect(screen.getByRole("button", { name: "Tools" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(rowFor("called_tool_1")).toBeInTheDocument();
  });

  it("starts short lists expanded", () => {
    renderTools({ calledToolCount: 2, notCalledToolCount: 3 });

    expect(screen.getByRole("button", { name: "Tools" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("shows the Called / Not called switch only when both sides have tools", () => {
    const both = renderTools({ calledToolCount: 2, notCalledToolCount: 3 });
    expect(
      screen.getByRole("tab", { name: /^Called\s*2$/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: /^Not called\s*3$/ }),
    ).toBeInTheDocument();
    both.unmount();

    const noneCalled = renderTools({
      calledToolCount: 0,
      notCalledToolCount: 3,
    });
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(rowFor("not_called_tool_3")).toBeInTheDocument();
    noneCalled.unmount();

    renderTools({ calledToolCount: 2, notCalledToolCount: 0 });
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(rowFor("called_tool_2")).toBeInTheDocument();
  });

  it("defaults to the Called tab", () => {
    renderTools({ calledToolCount: 2, notCalledToolCount: 3 });

    expect(screen.getByRole("tab", { name: /^Called\s*2$/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(rowFor("called_tool_1")).toBeInTheDocument();
    expect(rowFor("not_called_tool_1")).not.toBeInTheDocument();
  });

  it("numbers each tab from 1", () => {
    renderTools({ calledToolCount: 2, notCalledToolCount: 3 });

    expect(rowNumberOf("called_tool_1")).toBe("1.");

    fireEvent.mouseDown(screen.getByRole("tab", { name: /^Not called\s*3$/ }), {
      button: 0,
    });

    expect(rowFor("called_tool_1")).not.toBeInTheDocument();
    expect(rowNumberOf("not_called_tool_1")).toBe("1.");
    expect(rowNumberOf("not_called_tool_3")).toBe("3.");
  });

  it("toggles a row's details on click", () => {
    renderTools({ calledToolCount: 1, notCalledToolCount: 0 });

    const row = rowFor("called_tool_1")!;
    expect(row).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByText("called_tool_1 description"),
    ).not.toBeInTheDocument();

    fireEvent.click(row);
    expect(row).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("called_tool_1 description")).toBeInTheDocument();

    fireEvent.click(row);
    expect(row).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByText("called_tool_1 description"),
    ).not.toBeInTheDocument();
  });
});
