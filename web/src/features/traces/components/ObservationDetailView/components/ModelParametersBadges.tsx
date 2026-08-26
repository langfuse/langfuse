/**
 * Model parameter pills for ObservationDetailView.
 * Returns one pill per parameter so the header overflow list can hide them independently.
 */

import { type JsonNested } from "@langfuse/shared";
import { type ReactNode } from "react";

import {
  HeaderPill,
  HeaderPillValue,
} from "@/src/components/layouts/header-pill";

export function getModelParameterPills(
  modelParameters: JsonNested | null | undefined,
): Array<{ key: string; searchText: string; content: ReactNode }> {
  if (
    !modelParameters ||
    typeof modelParameters !== "object" ||
    Array.isArray(modelParameters)
  ) {
    return [];
  }

  return Object.entries(modelParameters).flatMap(([key, value]) => {
    if (value === null) return [];
    const valueString =
      Object.prototype.toString.call(value) === "[object Object]"
        ? JSON.stringify(value)
        : value?.toString();

    return [
      {
        key: `param-${key}`,
        searchText: `${key} ${valueString ?? ""}`,
        content: (
          <HeaderPill variant="display" title={`${key}: ${valueString}`}>
            <span className="max-w-40 truncate" title={key}>
              {key}
            </span>
            <HeaderPillValue>
              <span className="max-w-40 truncate" title={valueString}>
                {valueString}
              </span>
            </HeaderPillValue>
          </HeaderPill>
        ),
      },
    ];
  });
}
