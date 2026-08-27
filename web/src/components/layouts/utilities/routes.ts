import { type Route } from "../routes";

export type NavigationItem = Omit<Route, "children" | "items"> & {
  url: string;
  isActive: boolean;
  items?: NavigationItem[];
};
