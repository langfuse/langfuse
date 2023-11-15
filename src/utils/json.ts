import { type jsonSchema } from "@/src/utils/zod";
import { type z } from "zod";
import lodash from "lodash";

export const mergeJson = (
  json1?: z.infer<typeof jsonSchema>,
  json2?: z.infer<typeof jsonSchema>,
) => {
  if (json1 === undefined) {
    return json2;
  }
  return lodash.merge(json1, json2);
};
