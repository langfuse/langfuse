import { parseJsonPrioritised } from "@langfuse/shared";

export default (json: string) => {
  return parseJsonPrioritised(json);
};
