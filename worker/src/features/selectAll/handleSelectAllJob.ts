import { SelectAllProcessingEventType } from "@langfuse/shared/src/server";
import z from "zod";
import { orderBy } from "../../../../packages/shared/dist/src/interfaces/orderBy";
import { BatchExportTableName, singleFilter } from "@langfuse/shared";

export const SelectAllQuerySchema = z.object({
  tableName: z.nativeEnum(BatchExportTableName),
  filter: z.array(singleFilter).nullable(),
  orderBy,
});

export const handleSelectAllJob = async (
  selectAllEvent: SelectAllProcessingEventType,
) => {
  // given retries must skip any item we have already processed
  // // handle db read stream
  // const dbReadStream = await getDatabaseReadStream({
  //   projectId,
  //   cutoffCreatedAt: jobDetails.createdAt,
  //   ...parsedQuery.data,
  // });

  console.log("selectAllEvent", selectAllEvent);
};
