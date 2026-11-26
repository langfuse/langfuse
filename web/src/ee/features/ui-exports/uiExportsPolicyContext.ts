import { createContext } from "react";

/**
 * Fallback UI export disabled reason propagated from an authorized public
 * trace/session query for viewers who are not members of that project's org.
 */
export const UiExportsPolicyContext = createContext<string | null>(null);
