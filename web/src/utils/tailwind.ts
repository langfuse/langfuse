import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...values: ClassValue[]) {
  // eslint-disable-next-line tailwindcss/no-custom-classname -- eslint-plugin-tailwindcss misreads this helper's rest parameter as a class name.
  return twMerge(clsx(values));
}
