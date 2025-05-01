import { parseJsonPrioritised } from "../../json/json-parse";

export default async function parseLargeJson(json: string) {
  return parseJsonPrioritised(json);
}
