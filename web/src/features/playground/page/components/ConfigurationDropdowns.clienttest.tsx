import { fireEvent, render, screen } from "@testing-library/react";

import { LAYER_ORDER } from "@/src/components/ui/layer";
import {
  type PlaygroundSchema,
  type PlaygroundTool,
} from "@/src/features/playground/page/types";

const { playgroundState, savedTool, savedSchema } = vi.hoisted(() => {
  const savedTool = {
    id: "tool-1",
    name: "get_weather",
    description: "Look up the weather",
    parameters: { type: "object", properties: {} },
    projectId: "p1",
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
  };

  const savedSchema = {
    id: "schema-1",
    name: "weather_report",
    description: "Shape of the weather report",
    schema: { type: "object", properties: {} },
    projectId: "p1",
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
  };

  return {
    savedTool,
    savedSchema,
    playgroundState: {
      tools: [] as PlaygroundTool[],
      structuredOutputSchema: null as PlaygroundSchema | null,
    },
  };
});

vi.mock("../hooks/usePlaygroundWindowSize", () => ({
  usePlaygroundWindowSize: () => ({
    containerRef: { current: null },
    width: 800,
    isVeryCompact: false,
    isCompact: false,
  }),
}));

vi.mock("../context", () => ({
  usePlaygroundContext: () => ({
    tools: playgroundState.tools,
    setTools: vi.fn(),
    structuredOutputSchema: playgroundState.structuredOutputSchema,
    setStructuredOutputSchema: vi.fn(),
    promptVariables: [],
    messagePlaceholders: [],
  }),
}));

vi.mock("@/src/hooks/useProjectIdFromURL", () => ({
  default: () => "p1",
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    useUtils: () => ({
      llmTools: { getAll: { invalidate: vi.fn() } },
      llmSchemas: { getAll: { invalidate: vi.fn() } },
    }),
    llmTools: {
      getAll: {
        useQuery: () => ({ data: [savedTool] }),
      },
      create: { useMutation: () => ({ mutateAsync: vi.fn() }) },
      update: { useMutation: () => ({ mutateAsync: vi.fn() }) },
      delete: { useMutation: () => ({ mutateAsync: vi.fn() }) },
    },
    llmSchemas: {
      getAll: {
        useQuery: () => ({ data: [savedSchema] }),
      },
      create: { useMutation: () => ({ mutateAsync: vi.fn() }) },
      update: { useMutation: () => ({ mutateAsync: vi.fn() }) },
      delete: { useMutation: () => ({ mutateAsync: vi.fn() }) },
    },
  },
}));

vi.mock("@/src/components/editor", () => ({
  CodeMirrorEditor: () => null,
}));

import { ConfigurationDropdowns } from "./ConfigurationDropdowns";

const installOverlayLayers = () => {
  const overlayRoot = document.createElement("div");
  overlayRoot.setAttribute("data-overlay-root", "");
  for (const layer of LAYER_ORDER) {
    const layerNode = document.createElement("div");
    layerNode.setAttribute("data-layer", layer);
    overlayRoot.appendChild(layerNode);
  }
  document.body.appendChild(overlayRoot);
};

const openToolsPopover = () => {
  fireEvent.click(screen.getByRole("button", { name: /tools/i }));
};

const openSchemaPopover = () => {
  fireEvent.click(screen.getByRole("button", { name: /schema/i }));
};

const expectDialogWithoutToolsPopover = (title: string) => {
  expect(screen.getByRole("heading", { name: title })).toBeTruthy();
  expect(
    screen.queryByText("Configure tools for your model to use."),
  ).toBeNull();
};

const expectDialogWithoutSchemaPopover = (title: string) => {
  expect(screen.getByRole("heading", { name: title })).toBeTruthy();
  expect(
    screen.queryByText("Configure JSON schema for structured output."),
  ).toBeNull();
};

describe("ConfigurationDropdowns overlays", () => {
  beforeAll(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    Element.prototype.scrollIntoView = vi.fn();
    Element.prototype.hasPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
  });

  beforeEach(() => {
    playgroundState.tools = [];
    playgroundState.structuredOutputSchema = null;
    installOverlayLayers();
  });

  afterEach(() => {
    document.querySelector("[data-overlay-root]")?.remove();
  });

  it("closes the tools popover when creating a tool", () => {
    render(<ConfigurationDropdowns />);
    openToolsPopover();

    fireEvent.click(screen.getByRole("button", { name: /create new tool/i }));

    expectDialogWithoutToolsPopover("Create LLM Tool");
  });

  it("closes the tools popover when editing a saved tool", () => {
    render(<ConfigurationDropdowns />);
    openToolsPopover();

    fireEvent.click(
      screen.getByRole("button", { name: "Edit tool get_weather" }),
    );

    expectDialogWithoutToolsPopover("Edit LLM Tool");
  });

  it("closes the tools popover when editing an attached tool card", () => {
    playgroundState.tools = [
      {
        id: savedTool.id,
        name: savedTool.name,
        description: savedTool.description,
        parameters: savedTool.parameters,
        existingLlmTool: savedTool,
      },
    ];
    render(<ConfigurationDropdowns />);
    openToolsPopover();

    fireEvent.click(screen.getByRole("heading", { name: "get_weather" }));

    expectDialogWithoutToolsPopover("Edit LLM Tool");
  });

  it("closes the schema popover when creating a schema", () => {
    render(<ConfigurationDropdowns />);
    openSchemaPopover();

    fireEvent.click(screen.getByRole("button", { name: /create new schema/i }));

    expectDialogWithoutSchemaPopover("Create LLM Schema");
  });

  it("closes the schema popover when editing a saved schema", () => {
    render(<ConfigurationDropdowns />);
    openSchemaPopover();

    fireEvent.click(
      screen.getByRole("button", { name: "Edit schema weather_report" }),
    );

    expectDialogWithoutSchemaPopover("Edit LLM Schema");
  });

  it("closes the schema popover when editing the attached schema card", () => {
    playgroundState.structuredOutputSchema = {
      id: savedSchema.id,
      name: savedSchema.name,
      description: savedSchema.description,
      schema: savedSchema.schema,
      existingLlmSchema: savedSchema,
    };
    render(<ConfigurationDropdowns />);
    openSchemaPopover();

    fireEvent.click(screen.getByRole("heading", { name: "weather_report" }));

    expectDialogWithoutSchemaPopover("Edit LLM Schema");
  });
});
