// JSON.stringify emits lone UTF-16 surrogates as \\uD800-\\uDFFF escapes. Keep
// escaped backslashes intact so literal text such as `\ud800` is not mistaken
// for a malformed code unit.
const LONE_SURROGATE_ESCAPE = /(?<!\\)((?:\\\\)*)\\u(d[89a-f][0-9a-f]{2})/gi;

export const stringifyJsonWithSanitizedSurrogates = (
  value: unknown,
): string => {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new TypeError("Cannot serialize undefined as JSON");
  }

  return serialized.replace(LONE_SURROGATE_ESCAPE, "$1\uFFFD");
};
