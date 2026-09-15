import { useRouter } from "next/router";

export type JsonTableValueFace = "sans-sm" | "mono-xs";

export const JSON_TABLE_VALUE_FACE_QUERY = "jsonValues";

export const JSON_TABLE_VALUE_FACE_CLASSES: Record<JsonTableValueFace, string> =
  {
    "sans-sm": "text-sm/5 wrap-break-word",
    "mono-xs": "font-mono text-xs/5 wrap-break-word",
  };

export function parseJsonTableValueFace(value: unknown): JsonTableValueFace {
  return value === "mono-xs" ? "mono-xs" : "sans-sm";
}

export function useJsonTableValueFace() {
  const router = useRouter();
  const face = parseJsonTableValueFace(
    router.query[JSON_TABLE_VALUE_FACE_QUERY],
  );

  const setFace = (next: JsonTableValueFace) => {
    const query = { ...router.query };
    if (next === "sans-sm") {
      delete query[JSON_TABLE_VALUE_FACE_QUERY];
    } else {
      query[JSON_TABLE_VALUE_FACE_QUERY] = next;
    }
    void router.replace({ pathname: router.pathname, query }, undefined, {
      shallow: true,
    });
  };

  return {
    face,
    classes: JSON_TABLE_VALUE_FACE_CLASSES[face],
    setFace,
  };
}
