import { api } from "@/src/utils/api";

export const targetOptionsQueryMap = {
  "trace-add-to-annotation-queue": api.annotationQueues.allNamesAndIds.useQuery,
} as const;
