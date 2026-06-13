// Shared, dependency-free constants for the search-bar feature. Kept in its
// own module so both the client hook and the server router reference the same
// literal (the server writes the key into Project.metadata; the client reads
// it back, so the exact string must agree).

/** Project.metadata key holding the per-project search-bar opt-in flag. */
export const SEARCH_BAR_PROJECT_METADATA_KEY = "searchBarEnabled";
