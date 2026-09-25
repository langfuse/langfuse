import preview from "../../../../../.storybook/preview";

import { Table } from "@/src/components/design-system/table/Table";
import {
  createActorTableColumn,
  type TableActor,
} from "./createActorTableColumn";

type Row = { actor: TableActor | null };

const rows: Row[] = [
  {
    actor: {
      type: "USER",
      body: {
        id: "user-1",
        name: "Ada Lovelace",
        email: "ada@example.com",
        image: null,
      },
    },
  },
  {
    actor: {
      type: "API_KEY",
      body: { id: "api-key-1", publicKey: "pk-example" },
    },
  },
  { actor: null },
];

function ActorTableColumnStory({ variant }: { variant: "avatar" | "text" }) {
  return (
    <Table
      tableName="Actors"
      columns={[
        createActorTableColumn<Row>({
          accessorKey: "actor",
          header: "Actor",
          variant,
        }),
      ]}
      data={{ status: "success", data: rows }}
    />
  );
}

const meta = preview.meta({ component: ActorTableColumnStory });

export const Avatar = meta.story({ args: { variant: "avatar" } });
export const Text = meta.story({ args: { variant: "text" } });
