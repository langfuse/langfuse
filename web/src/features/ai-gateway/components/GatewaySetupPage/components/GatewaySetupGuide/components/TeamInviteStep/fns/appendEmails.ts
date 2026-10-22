const EMAIL_SEPARATOR = /[\s,;]+/;

/** Adds the addresses typed or pasted as `text`, skipping ones already listed. */
export function appendEmails(current: string[], text: string) {
  const emails = new Set(current);
  for (const email of text.split(EMAIL_SEPARATOR)) {
    const normalized = email.trim().toLowerCase();
    if (normalized.length > 0) emails.add(normalized);
  }
  return [...emails];
}
