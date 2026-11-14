import { useSession } from "next-auth/react";

import {
  getSessionReadPath,
  type ReadPath,
} from "@/src/features/events/hooks/getSessionReadPath";

export {
  type ReadPath,
  type ResolvedReadPath,
} from "@/src/features/events/hooks/getSessionReadPath";

/**
 * The user's v3/v4 read path, derived from the session. v4 is the default
 * experience; v3 is the explicit legacy opt-out. While the session is still
 * loading the read path is "unknown": UI chrome may use the `isV4` /
 * `isV3Legacy` booleans (both false while unknown), but anything that fetches
 * by version must consume a resolved `readPath` — gate rendering on
 * `isResolved` and pass the narrowed value down as a prop.
 */
export function useReadPath(): {
  readPath: ReadPath;
  isV4: boolean;
  isV3Legacy: boolean;
  isResolved: boolean;
  canToggleV4: boolean;
} {
  const { data: session, status } = useSession();
  return getSessionReadPath(session, status);
}
