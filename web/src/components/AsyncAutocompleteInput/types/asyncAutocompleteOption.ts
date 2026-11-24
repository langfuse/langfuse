import type { IconComponent } from "@langfuse/icons";

export type AsyncAutocompleteOption<V extends string = string> = {
  value: V;
  label: string;
  disabled?: boolean;
  secondaryLabel?: string;
  showSecondaryLabelInTag?: boolean;
  icon?: IconComponent;
  /** Tooltip / accessible description. */
  title?: string;
  /** Renders the option label in monospace (e.g. model slugs / patterns). */
  mono?: boolean;
  /** Strikes through the chip label (e.g. exclude patterns). */
  strikethrough?: boolean;
  /** Overrides whether the dropdown row shows a checkmark. */
  checked?: boolean;
};
