/**
 * AdvancedJsonViewer - Public exports
 *
 * Self-contained JSON viewer component with zero external dependencies
 * (except @tanstack/react-virtual and @radix-ui which are already in the project).
 */

// Main component
export { AdvancedJsonViewer } from "./AdvancedJsonViewer";

// Types
export type {
  AdvancedJsonViewerProps,
  ExpansionState,
  FlatJSONRow,
  JSONTheme,
  PartialJSONTheme,
  JSONType,
  JSONValue,
  SearchMatch,
  SearchOptions,
} from "./types";

// Utilities (if needed externally)
export {
  flattenJSON,
  toggleRowExpansion,
  expandAncestors,
} from "./utils/flattenJson";
export { searchInRows } from "./utils/searchJson";
export {
  getJSONType,
  isExpandable,
  formatValuePreview,
} from "./utils/jsonTypes";
