import preview from "@/.storybook/preview";
import {
  DataTable,
  type AsyncTableData,
} from "@/src/components/table/data-table";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import { createGatewayRoutesTableColumn } from "./createGatewayRoutesTableColumn";
import type { ApiFormat } from "./getGatewayModelApiFormats";

type Row = {
  id: string;
  apiFormats: ApiFormat[];
};

const rows: Row[] = [
  {
    id: "gpt-5-mini",
    apiFormats: ["OpenAI Responses", "OpenAI Chat Completions"],
  },
  { id: "claude-sonnet-4-5", apiFormats: ["Anthropic Messages"] },
  {
    id: "mistral.mistral-large-2407-v1:0",
    apiFormats: [
      "Anthropic Messages",
      "OpenAI Responses",
      "OpenAI Chat Completions",
    ],
  },
  { id: "amazon.titan-embed-text-v2:0", apiFormats: [] },
];

function GatewayRoutesTableColumnStory({
  routesColumnSize,
  data,
}: {
  routesColumnSize: number;
  data: AsyncTableData<Row[]>;
}) {
  const columns = [
    createTextTableColumn<Row>({
      accessorKey: "id",
      header: "Model",
      isFlexWidth: true,
    }),
    createGatewayRoutesTableColumn<Row>({ size: routesColumnSize }),
  ];

  return (
    <DataTable
      tableName="gateway-routes-column-story"
      columns={columns}
      data={data}
      hidePagination
    />
  );
}

const meta = preview.meta({
  component: GatewayRoutesTableColumnStory,
  parameters: { layout: "fullscreen" },
});

export const Default = meta.story({
  args: {
    routesColumnSize: 280,
    data: { isLoading: false, isError: false, data: rows },
  },
});

/** Too narrow for every route, so the rest collapse into a "+N" badge. */
export const Overflow = meta.story({
  args: {
    routesColumnSize: 140,
    data: { isLoading: false, isError: false, data: rows },
  },
});

export const Loading = meta.story({
  args: {
    routesColumnSize: 280,
    data: { isLoading: true, isError: false },
  },
});
