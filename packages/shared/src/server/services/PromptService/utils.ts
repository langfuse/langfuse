export function escapeRegex(str: string | number) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
