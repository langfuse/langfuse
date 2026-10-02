import preview from "../../../../../.storybook/preview";

import {
  DataTable,
  type AsyncTableData,
} from "@/src/components/table/data-table";
import { createBadgeListTableColumn } from "./createBadgeListTableColumn";
import { createTextTableColumn } from "./createTextTableColumn";

type Row = {
  member: string;
  providers: string[];
};

const columns = [
  // Narrow enough that a second chip never fits beside the first, so a row
  // shows either one chip plus the overflow chip or the overflow chip alone.
  createBadgeListTableColumn<Row>({
    accessorKey: "providers",
    header: "SSO Provider",
    size: 120,
  }),
  // Absorbs the leftover width so the badge column keeps its size.
  createTextTableColumn<Row>({
    accessorKey: "member",
    header: "Member",
    isFlexWidth: true,
  }),
];

function BadgeListTableColumnStory({ data }: { data: AsyncTableData<Row[]> }) {
  return (
    <DataTable
      tableName="badge-list-column-story"
      columns={columns}
      data={data}
      hidePagination
      cellPadding="comfortable"
    />
  );
}

const meta = preview.meta({
  component: BadgeListTableColumnStory,
  parameters: {
    layout: "fullscreen",
  },
});

/** Every row starts on the same inline edge, whichever state it is in. */
export const Default = meta.story({
  args: {
    data: {
      isLoading: false,
      isError: false,
      data: [
        { member: "ada@langfuse.com", providers: [] },
        { member: "grace@langfuse.com", providers: ["Okta"] },
        {
          member: "alan@langfuse.com",
          providers: ["Okta", "Google", "Auth0"],
        },
        {
          member: "edsger@langfuse.com",
          providers: ["Microsoft Entra ID", "Google"],
        },
      ],
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
