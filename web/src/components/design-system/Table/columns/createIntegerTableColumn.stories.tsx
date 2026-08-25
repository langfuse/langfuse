import preview from "../../../../../.storybook/preview";

import {
  DataTable,
  type AsyncTableData,
} from "@/src/components/table/data-table";
import { createIntegerTableColumn } from "./createIntegerTableColumn";

type Row = {
  count: number | null;
};

const columns = [
  createIntegerTableColumn<Row>({
    accessorKey: "count",
    header: "Count",
  }),
];

function IntegerTableColumnStory({ data }: { data: AsyncTableData<Row[]> }) {
  return (
    <DataTable
      tableName="integer-column-story"
      columns={columns}
      data={data}
      hidePagination
    />
  );
}

const meta = preview.meta({
  component: IntegerTableColumnStory,
  parameters: {
    layout: "fullscreen",
  },
});

export const Default = meta.story({
  args: {
    data: {
      isLoading: false,
      isError: false,
      data: [{ count: 1234 }],
    },
  },
});

export const Zero = meta.story({
  args: {
    data: {
      isLoading: false,
      isError: false,
      data: [{ count: 0 }],
    },
  },
});

export const EmptyValue = meta.story({
  name: "Empty Value",
  args: {
    data: {
      isLoading: false,
      isError: false,
      data: [{ count: null }],
    },
  },
});

export const Loading = meta.story({
  args: {
    data: {
      isLoading: true,
      isError: false,
    },
  },
});
