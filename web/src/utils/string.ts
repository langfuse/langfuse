export { truncate } from "@langfuse/shared";

export function lastCharacters(str: string, n: number) {
  return str.substring(str.length - n);
}
