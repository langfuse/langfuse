import { fn } from "storybook/test";
import preview from "../../../../../.storybook/preview";

import { Table } from "@/src/components/design-system/table/Table";
import { createButtonTableColumn } from "./createButtonTableColumn";

const onVerify = fn();

function ButtonTableColumnStory() {
  return (
    <Table
      tableName="Button column"
      columns={[
        createButtonTableColumn<
          {
            id: string;
            verified: boolean;
            loading: boolean;
          },
          string
        >({
          accessorFn: (row) => row.id,
          id: "verify",
          header: "",
          getButton: ({ row }) => ({
            text: "Verify",
            onClick: () => onVerify(row.original.id),
            disabled: row.original.verified,
            loading: row.original.loading,
          }),
        }),
      ]}
      data={{
        status: "success",
        data: [
          { id: "pending", verified: false, loading: false },
          { id: "verified", verified: true, loading: false },
          { id: "verifying", verified: false, loading: true },
        ],
      }}
    />
  );
}

const meta = preview.meta({ component: ButtonTableColumnStory });

export const Default = meta.story();
