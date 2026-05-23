import { env } from "@/src/env.mjs";

export function getSpielwieseAssetPath(path: `/${string}`) {
  return `${env.NEXT_PUBLIC_BASE_PATH ?? ""}${path}`;
}
