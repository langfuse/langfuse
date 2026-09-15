import { claimed, unmatched } from "../..";
import type { ConventionResult, IOConvention } from "../../io-convention";

/**
 * Agno logs messages as Python reprs:
 * "role='user' content='...' name=None tool_call_id=None ...".
 * Bounded parse: role, then content up to the quote preceding the next
 * `field=`; anything the pattern doesn't match stays plain text.
 */
function parsePythonReprMessage(
  value: string,
): { role: string; content: string } | undefined {
  if (!value.startsWith("role='")) return undefined;

  const match =
    /^role='(\w+)' content=(?:'([\s\S]*?)'|"([\s\S]*?)")(?= \w+=)/.exec(value);
  if (!match) return undefined;

  const content = (match[2] ?? match[3] ?? "")
    .replace(/\\'/g, "'")
    .replace(/\\n/g, "\n");
  return { role: match[1], content };
}

export const agnoProvider = {
  name: "agno",
  tryPreprocessMessage: (value: string): ConventionResult<unknown> => {
    const message = parsePythonReprMessage(value);
    return message ? claimed(message) : unmatched;
  },
} satisfies IOConvention;
