import { use } from "react";
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";

export type JsonTableValueFace = "sans-sm" | "mono-xs";

const JSON_TABLE_VALUE_FACE_QUERY = "jsonValues";

const JSON_TABLE_VALUE_FACE_CLASSES: Record<JsonTableValueFace, string> = {
  "sans-sm": "text-sm/5 wrap-break-word",
  "mono-xs": "font-mono text-xs/5 wrap-break-word",
};

export function parseJsonTableValueFace(value: unknown): JsonTableValueFace {
  return value === "mono-xs" ? "mono-xs" : "sans-sm";
}

export function useJsonTableValueFace() {
  const router = use(RouterContext);
  const face = parseJsonTableValueFace(
    router?.query[JSON_TABLE_VALUE_FACE_QUERY],
  );

  const setFace = (next: JsonTableValueFace) => {
    if (!router) {
      return;
    }
    const query = { ...router.query };
    if (next === "sans-sm") {
      delete query[JSON_TABLE_VALUE_FACE_QUERY];
    } else {
      query[JSON_TABLE_VALUE_FACE_QUERY] = next;
    }
    router
      .replace({ pathname: router.pathname, query }, undefined, {
        shallow: true,
      })
      .catch(() => undefined);
  };

  return {
    face,
    classes: JSON_TABLE_VALUE_FACE_CLASSES[face],
    setFace,
  };
}
