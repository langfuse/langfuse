import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";

import {
  ToolCallDefinitionCard,
  type ToolDefinition,
} from "./ToolCallDefinitionCard";
import type { ToolCallInvocation } from "../hooks/useChatMLParser";

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
  availableToolCount,
}: {
  calledToolCount: number;
  availableToolCount: number;
}) {
  const calledTools = Array.from({ length: calledToolCount }, (_, index) =>
    makeTool(`called_tool_${index + 1}`),
  );
  const availableTools = Array.from(
    { length: availableToolCount },
    (_, index) => makeTool(`available_tool_${index + 1}`),
  );
  const tools = [...calledTools, ...availableTools];
  const toolCallCounts = new Map<string, number>();
  const toolCallsByName = new Map<string, ToolCallInvocation[]>();
  const toolNameToDefinitionNumber = new Map<string, number>();

  tools.forEach((tool, index) => {
    toolNameToDefinitionNumber.set(tool.name, index + 1);
  });

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
      toolNameToDefinitionNumber={toolNameToDefinitionNumber}
    />,
  );
}

describe("ToolCallDefinitionCard", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createMemoryStorage());
    vi.stubGlobal("sessionStorage", createMemoryStorage());
  });

  it("renders up to five called tools individually", () => {
    renderTools({ calledToolCount: 5, availableToolCount: 0 });

    expect(
      screen.queryByRole("button", { name: /tools were called/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/called_tool_1/)).toBeInTheDocument();
    expect(screen.getByText(/called_tool_5/)).toBeInTheDocument();
  });

  it("collapses more than five called tools and expands them on click", () => {
    renderTools({ calledToolCount: 6, availableToolCount: 0 });

    expect(
      screen.getByRole("button", { name: /6 tools were called/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/called_tool_1/)).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /6 tools were called/i }),
    );

    expect(screen.getByText(/called_tool_1/)).toBeInTheDocument();
    expect(screen.getByText(/called_tool_6/)).toBeInTheDocument();
  });

  it("persists called tool group expansion in session storage", () => {
    const { unmount } = renderTools({
      calledToolCount: 6,
      availableToolCount: 0,
    });

    fireEvent.click(
      screen.getByRole("button", { name: /6 tools were called/i }),
    );
    unmount();

    renderTools({ calledToolCount: 6, availableToolCount: 0 });

    expect(screen.getByText(/called_tool_1/)).toBeInTheDocument();
  });

  it("renders up to three available tools individually", () => {
    renderTools({ calledToolCount: 0, availableToolCount: 3 });

    expect(
      screen.queryByRole("button", {
        name: /available tools were not called/i,
      }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/available_tool_1/)).toBeInTheDocument();
    expect(screen.getByText(/available_tool_3/)).toBeInTheDocument();
  });

  it("collapses more than three available tools and expands them on click", () => {
    renderTools({ calledToolCount: 0, availableToolCount: 4 });

    expect(
      screen.getByRole("button", {
        name: /4 available tools were not called/i,
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/available_tool_1/)).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: /4 available tools were not called/i,
      }),
    );

    expect(screen.getByText(/available_tool_1/)).toBeInTheDocument();
    expect(screen.getByText(/available_tool_4/)).toBeInTheDocument();
  });
});
