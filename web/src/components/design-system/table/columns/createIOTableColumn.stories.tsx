import preview from "../../../../../.storybook/preview";
import { expect } from "storybook/test";

import { MediaTag } from "@/src/components/MediaTag/MediaTag";
import { type IOTableCellVariant } from "@/src/components/design-system/table/components/IOTableCell/IOTableCell";
import {
  DataTable,
  type AsyncTableData,
} from "@/src/components/table/data-table";
import { type MediaDescriptor } from "@/src/components/ui/media/mediaUtils";
import { createIOTableColumn } from "./createIOTableColumn";

type Row = {
  isCellLoading?: boolean;
  value: unknown;
};

type Presentation = "default" | "input" | "output" | "compact" | "multiLine";

type PresentationConfig = {
  compact?: boolean;
  header: string;
  singleLine: boolean;
  variant?: IOTableCellVariant;
};

const presentations: Record<Presentation, PresentationConfig> = {
  default: { header: "Default", singleLine: true },
  input: { header: "Input", singleLine: true, variant: "input" },
  output: { header: "Output", singleLine: true, variant: "output" },
  compact: { compact: true, header: "Compact", singleLine: true },
  multiLine: { header: "Multi-line", singleLine: false },
};

const renderMediaReference = (descriptor: MediaDescriptor) => (
  <MediaTag contentType={descriptor.contentType} status="idle" />
);

function IOTableColumnStory({
  data,
  presentation,
}: {
  data: AsyncTableData<Row[]>;
  presentation: Presentation;
}) {
  const config = presentations[presentation];
  const columns = [
    createIOTableColumn<Row>({
      accessorKey: "value",
      compact: config.compact,
      enableExpandOnHover: config.singleLine,
      getCell: (value, { row }) =>
        row.original.isCellLoading ? { type: "loading" } : (value ?? undefined),
      header: config.header,
      renderMediaReference,
      singleLine: config.singleLine,
      size: 260,
      variant: config.variant,
    }),
  ];

  return (
    <DataTable
      tableName={`io-column-${presentation}-story`}
      columns={columns}
      data={data}
      hidePagination
      cellPadding="none"
    />
  );
}

const meta = preview.meta({
  component: IOTableColumnStory,
  parameters: {
    layout: "fullscreen",
  },
});

const defaultValue = {
  prompt: "What is Langfuse?",
  response: "An open-source LLM engineering platform.",
};

export const Default = meta.story({
  args: {
    presentation: "default",
    data: {
      isLoading: false,
      isError: false,
      data: [{ value: defaultValue }],
    },
  },
});

export const Input = meta.story({
  args: {
    presentation: "input",
    data: {
      isLoading: false,
      isError: false,
      data: [{ value: { prompt: "What is Langfuse?" } }],
    },
  },
});

export const Output = meta.story({
  args: {
    presentation: "output",
    data: {
      isLoading: false,
      isError: false,
      data: [
        { value: { response: "An open-source LLM engineering platform." } },
      ],
    },
  },
});

export const Compact = meta.story({
  args: {
    presentation: "compact",
    data: {
      isLoading: false,
      isError: false,
      data: [{ value: { model: "gpt-5" } }],
    },
  },
});

export const MultiLine = meta.story({
  name: "Multi-line",
  args: {
    presentation: "multiLine",
    data: {
      isLoading: false,
      isError: false,
      data: [{ value: defaultValue }],
    },
  },
});

export const EmptyValue = meta.story({
  name: "Empty Value",
  args: {
    presentation: "default",
    data: {
      isLoading: false,
      isError: false,
      data: [{ value: null }],
    },
  },
});

export const CellLoading = meta.story({
  name: "Cell Loading",
  args: {
    presentation: "default",
    data: {
      isLoading: false,
      isError: false,
      data: [{ isCellLoading: true, value: null }],
    },
  },
});

export const Loading = meta.story({
  args: {
    presentation: "default",
    data: {
      isLoading: true,
      isError: false,
    },
  },
});

export const MultiLineLoading = meta.story({
  name: "Multi-line Loading",
  args: {
    presentation: "multiLine",
    data: {
      isLoading: true,
      isError: false,
    },
  },
});

type BackgroundRow = {
  input: unknown;
  output: unknown;
};

const backgroundColumns = [
  createIOTableColumn<BackgroundRow>({
    accessorKey: "input",
    header: "Input",
    renderMediaReference,
    singleLine: true,
    variant: "input",
  }),
  createIOTableColumn<BackgroundRow>({
    accessorKey: "output",
    header: "Output",
    renderMediaReference,
    singleLine: true,
    variant: "output",
  }),
];

function BackgroundColumnsStory({
  data,
  tableName,
}: {
  data: AsyncTableData<BackgroundRow[]>;
  tableName: string;
}) {
  return (
    <DataTable
      tableName={tableName}
      columns={backgroundColumns}
      data={data}
      hidePagination
      cellPadding="none"
    />
  );
}

type FalsyRow = {
  fallback: unknown;
  omitted: unknown;
  preserved: unknown;
};

const falsyColumns = [
  createIOTableColumn<FalsyRow>({
    accessorKey: "omitted",
    getCell: (value) => value || undefined,
    header: "Omitted",
    renderMediaReference,
    singleLine: true,
  }),
  createIOTableColumn<FalsyRow>({
    accessorKey: "fallback",
    getCell: (value) => value || "-",
    header: "Fallback",
    renderMediaReference,
    singleLine: true,
  }),
  createIOTableColumn<FalsyRow>({
    accessorKey: "preserved",
    header: "Preserved",
    renderMediaReference,
    singleLine: true,
  }),
];

export const TestCustomFalsyHandling = meta.story({
  name: "(Test) Custom Falsy Handling",
  render: () => (
    <DataTable
      tableName="io-column-falsy-handling-story"
      columns={falsyColumns}
      data={{
        isLoading: false,
        isError: false,
        data: [{ fallback: false, omitted: false, preserved: false }],
      }}
      hidePagination
      cellPadding="none"
    />
  ),
  play: async ({ canvas }) => {
    await expect(canvas.queryByText("false")).toBeInTheDocument();
    await expect(canvas.getAllByText("false")).toHaveLength(1);
    await expect(canvas.getByText("-")).toBeInTheDocument();
  },
});

export const TestLoadedCellBackgrounds = meta.story({
  name: "(Test) Loaded Cell Backgrounds",
  render: () => (
    <BackgroundColumnsStory
      tableName="io-column-loaded-background-story"
      data={{
        isLoading: false,
        isError: false,
        data: [
          {
            input: { prompt: "What is Langfuse?" },
            output: {
              response: "An open-source LLM engineering platform.",
            },
          },
        ],
      }}
    />
  ),
  play: async ({ canvasElement }) => {
    const row = canvasElement.querySelector("tbody tr");
    if (!(row instanceof HTMLTableRowElement)) throw new Error("Row not found");

    const [inputCell, outputCell] = Array.from(row.cells);
    await expect(inputCell).toHaveClass("bg-muted/50");
    await expect(outputCell).toHaveClass("bg-accent-light-green");
    await expect(inputCell?.querySelector('[class~="bg-muted/50"]')).toBeNull();
    await expect(
      outputCell?.querySelector(".bg-accent-light-green"),
    ).toBeNull();
  },
});

export const TestLoadingCellBackgrounds = meta.story({
  name: "(Test) Loading Cell Backgrounds",
  render: () => (
    <BackgroundColumnsStory
      tableName="io-column-loading-background-story"
      data={{ isLoading: true, isError: false }}
    />
  ),
  play: async ({ canvasElement }) => {
    const row = canvasElement.querySelector("tbody tr");
    if (!(row instanceof HTMLTableRowElement)) throw new Error("Row not found");

    const [inputCell, outputCell] = Array.from(row.cells);
    await expect(inputCell).toHaveClass("bg-muted/50");
    await expect(outputCell).toHaveClass("bg-accent-light-green");
    await expect(inputCell).toHaveClass(
      "[&_[data-slot=skeleton]]:bg-muted-foreground/20",
    );
    await expect(outputCell).toHaveClass(
      "[&_[data-slot=skeleton]]:bg-accent-dark-green/20",
    );
  },
});
