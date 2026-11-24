import { defaultFilter } from "cmdk";

import type { TagAutocompleteOption } from "@/src/components/TagAutocompleteInput/types/tagAutocompleteOption";

/** Ranks static options against the query, best match first, like cmdk itself. */
export function rankTagAutocompleteOptions<V extends string>(
  options: readonly TagAutocompleteOption<V>[],
  query: string,
): TagAutocompleteOption<V>[] {
  const trimmed = query.trim();
  if (!trimmed) return [...options];

  const rank = (option: TagAutocompleteOption<V>) =>
    defaultFilter!(option.value || option.label, trimmed, [
      [option.label, option.secondaryLabel].filter(Boolean).join(" "),
    ]);

  return options
    .map((option) => ({ option, score: rank(option) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ option }) => option);
}
