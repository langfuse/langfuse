import {
  EMPTY_VALUE_LABEL,
  EMPTY_VALUE_PLACEHOLDER,
} from "@/src/components/design-system/table/constants";

/**
 * A value that arrived and is empty. One treatment for every table, so an
 * empty cell never reads as a cell that failed.
 *
 * The em dash alone reaches a screen reader as punctuation, so the meaning
 * travels in a visually-hidden word beside it.
 */
export const EmptyValue = () => (
  <span className="text-muted-foreground">
    <span aria-hidden="true">{EMPTY_VALUE_PLACEHOLDER}</span>
    <span className="sr-only">{EMPTY_VALUE_LABEL}</span>
  </span>
);
