import { Globe } from "@langfuse/icons";

import type { AsyncAutocompleteOption } from "@/src/components/AsyncAutocompleteInput/AsyncAutocompleteInput";

export const EVERYONE_TARGET_VALUE = "org:everyone";
export const USER_TARGET_PREFIX = "user:";
export const API_KEY_TARGET_PREFIX = "key:";

export const EVERYONE_TARGET_OPTION: AsyncAutocompleteOption = {
  value: EVERYONE_TARGET_VALUE,
  label: "Everyone",
  icon: Globe,
};
