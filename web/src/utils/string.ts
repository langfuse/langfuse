export { truncate } from "@langfuse/shared";

function lastCharacters(str: string, n: number) {
  return str.substring(str.length - n);
}
