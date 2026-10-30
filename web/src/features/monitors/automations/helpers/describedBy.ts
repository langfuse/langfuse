/** describedBy joins the ids an input's aria-describedby should list, skipping missing ones. */
export function describedBy(
  ...ids: (string | undefined)[]
): string | undefined {
  const present = ids.filter((id) => id !== undefined);
  if (present.length === 0) return undefined;
  return present.join(" ");
}
