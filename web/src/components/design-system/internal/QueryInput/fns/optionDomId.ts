// Option ids may contain whitespace; encoding preserves unique ARIA IDREFs.
export function optionDomId(listboxId: string, optionId: string): string {
  return `${listboxId}-opt-${encodeURIComponent(optionId)}`;
}
