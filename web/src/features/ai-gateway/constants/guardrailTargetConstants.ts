import { Globe } from "@langfuse/icons";

import type { TagAutocompleteOption } from "@/src/components/TagAutocompleteInput/TagAutocompleteInput";

export const EVERYONE_TARGET_VALUE = "org:everyone";
export const USER_TARGET_PREFIX = "user:";
export const API_KEY_TARGET_PREFIX = "key:";

export const EVERYONE_TARGET_OPTION: TagAutocompleteOption = {
  value: EVERYONE_TARGET_VALUE,
  label: "Everyone",
  icon: Globe,
};
