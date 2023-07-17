import { type availableFlags } from "./availableFlags";

export type Flag = (typeof availableFlags)[number];
export type Flags = {
  [key in (typeof availableFlags)[number]]: boolean;
};
