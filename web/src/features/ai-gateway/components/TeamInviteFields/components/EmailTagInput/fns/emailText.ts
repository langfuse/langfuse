/** Splits typed or pasted text on whitespace, commas, and semicolons. */
function splitEmailText(text: string) {
  return text.split(/[\s,;]+/);
}

/** Adds the addresses typed or pasted as `text`, skipping ones already listed. */
export function appendEmails(current: string[], text: string) {
  const emails = new Set(current);
  for (const email of splitEmailText(text)) {
    const normalized = email.trim().toLowerCase();
    if (normalized.length > 0) emails.add(normalized);
  }
  return [...emails];
}
