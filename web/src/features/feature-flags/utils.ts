import { availableFlags } from "./available-flags";
import { type Flags } from "./types";

export const parseFlags = (dbFlags: string[]): Flags => {
  const parsedFlags = {} as Flags;

  availableFlags.forEach((flag) => {
    parsedFlags[flag] = dbFlags.includes(flag);
  });

  return parsedFlags;
};
