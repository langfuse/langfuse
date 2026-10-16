export const OTHER_ANSWER_LABEL = "Type your answer";

export const OPTION_LIST_CLASS_NAME =
  "divide-border border-border divide-y border-b";

export const OPTION_ROW_CLASS_NAME =
  "hover:bg-muted/50 has-focus-visible:bg-muted/50 flex cursor-pointer items-start gap-3 px-4 py-2 text-xs has-disabled:cursor-not-allowed";

export const OPTION_CONTROL_CLASS_NAME = "flex h-5 shrink-0 items-center";

export const OPTION_TEXT_CLASS_NAME = "flex min-w-0 flex-1 flex-col";

export function withRecommended(label: string, isRecommended: boolean) {
  return isRecommended ? `${label} (Recommended)` : label;
}
