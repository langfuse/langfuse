import { createContext, useContext } from "react";

export const ClubPlaybackContext = createContext<(() => void) | null>(null);
export function useClubPlayback() {
  return useContext(ClubPlaybackContext);
}
