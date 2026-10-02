import preview from "../../../../../.storybook/preview";

import {
  DataTable,
  type AsyncTableData,
} from "@/src/components/table/data-table";
import { createTokenUsageTableColumn } from "./createTokenUsageTableColumn";

type Row = {
  isUsageLoading?: boolean;
  usage: {
    inputUsage: number;
    outputUsage: number;
    totalUsage: number;
  } | null;
  details?: {
    input: number;
    output: number;
    total: number;
  };
  pricingTierName?: string;
};

function TokenUsageTableColumnStory({
  data,
  showBreakdown,
}: {
  data: AsyncTableData<Row[]>;
  showBreakdown: boolean;
}) {
  const columns = [
    createTokenUsageTableColumn<Row, Row["usage"]>({
      id: "tokens",
      accessorFn: (row) => row.usage,
      header: "Tokens",
      getCell: (value, { row }) => {
        if (row.original.isUsageLoading) return { type: "loading" };
        if (!value) return undefined;
        if (!value.inputUsage && !value.outputUsage && !value.totalUsage) {
          return undefined;
        }

        if (showBreakdown && row.original.details) {
          return {
            type: "usage",
            inputUsage: value.inputUsage,
            outputUsage: value.outputUsage,
            totalUsage: value.totalUsage,
            details: row.original.details,
            pricingTierName: row.original.pricingTierName,
          };
        }

        return {
          type: "usage",
          inputUsage: value.inputUsage,
          outputUsage: value.outputUsage,
          totalUsage: value.totalUsage,
        };
      },
    }),
  ];

  return (
    <DataTable
      tableName="token-usage-column-story"
      columns={columns}
      data={data}
      hidePagination
      cellPadding="comfortable"
    />
  );
}

const meta = preview.meta({
  component: TokenUsageTableColumnStory,
  parameters: {
    layout: "fullscreen",
  },
});

const usage = { inputUsage: 1280, outputUsage: 246, totalUsage: 1526 };
const details = { input: 1280, output: 246, total: 1526 };

export const Default = meta.story({
  args: {
    showBreakdown: true,
    data: {
      isLoading: false,
      isError: false,
      data: [{ usage, details }],
    },
  },
});

export const WithoutBreakdown = meta.story({
  name: "Without Breakdown",
  args: {
    showBreakdown: false,
    data: {
      isLoading: false,
      isError: false,
      data: [{ usage }],
    },
  },
});

export const WithPricingTier = meta.story({
  name: "With Pricing Tier",
  args: {
    showBreakdown: true,
    data: {
      isLoading: false,
      isError: false,
      data: [
        {
          usage,
          details: {
            input: 1000,
            output: 246,
            total: 1526,
          },
          pricingTierName: "Standard",
        },
      ],
    },
  },
});

export const EmptyValue = meta.story({
  name: "Empty Value",
  args: {
    showBreakdown: true,
    data: {
      isLoading: false,
      isError: false,
      data: [{ usage: { inputUsage: 0, outputUsage: 0, totalUsage: 0 } }],
    },
  },
});

export const CellLoading = meta.story({
  name: "Cell Loading",
  args: {
    showBreakdown: true,
    data: {
      isLoading: false,
      isError: false,
      data: [{ isUsageLoading: true, usage: null }],
    },
  },
});

export const Loading = meta.story({
  args: {
    showBreakdown: true,
    data: {
      isLoading: true,
      isError: false,
    },
  },
});
