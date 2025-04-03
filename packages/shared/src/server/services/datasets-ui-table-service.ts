import { evalDatasetFormFilterCols } from "../../tableDefinitions/tracesTable";
import { FilterState } from "../../types";
import { tableColumnsToSqlFilterAndPrefix } from "../filterToPrisma";
import { Prisma, prisma } from "../../db";

type FetchDatasetItemsTableProps = {
  select: "count";
  projectId: string;
  filter: FilterState;
};

const getDatasetRunItemsTableGeneric = async <T>(
  props: FetchDatasetItemsTableProps,
) => {
  const { select, projectId, filter } = props;

  let sqlSelect: Prisma.Sql;
  switch (select) {
    case "count":
      sqlSelect = Prisma.sql`count(*) as count`;
      break;
    default:
      // eslint-disable-next-line no-case-declarations, no-unused-vars
      const exhaustiveCheckDefault: never = select;
      throw new Error(`Unknown select type: ${select}`);
  }

  const datasetItemsFilter = tableColumnsToSqlFilterAndPrefix(
    filter,
    evalDatasetFormFilterCols,
    "dataset_items",
  );

  const query = Prisma.sql`
    SELECT 
      ${sqlSelect}
      FROM dataset_run_items as dri
        JOIN dataset_items as di ON di.id = dri.dataset_item_id AND di.project_id = ${projectId}
        WHERE dri.project_id = ${projectId}
        ${datasetItemsFilter}
  `;

  const res = await prisma.$queryRaw<T>(query);

  return res;
};

export const getDatasetRunItemsTableCount = async (props: {
  projectId: string;
  filter: FilterState;
}) => {
  const res = await getDatasetRunItemsTableGeneric<Array<{ count: bigint }>>({
    select: "count",
    projectId: props.projectId,
    filter: props.filter,
  });

  const totalCount = res.length > 0 ? Number(res[0].count) : 0;

  return { totalCount };
};
