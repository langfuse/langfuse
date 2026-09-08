/**
 * Whether a GitHub pull request should receive the `cursor` label.
 * Keep the same three signals in `.github/workflows/label-cursor-prs.yml`.
 */
export function isCursorPr({ author = "", headRef = "", body = "" } = {}) {
  return (
    author === "cursor[bot]" ||
    headRef.startsWith("cursor/") ||
    body.includes("CURSOR_AGENT_PR_BODY_BEGIN")
  );
}
