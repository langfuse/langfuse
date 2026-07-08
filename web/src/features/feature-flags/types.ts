import { type availableFlags } from "./available-flags";

export type Flag = (typeof availableFlags)[number];
export type Flags = {
  [key in (typeof availableFlags)[number]]: boolean;
};
