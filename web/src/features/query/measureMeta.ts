import { viewDeclarations } from "@/src/features/query/dataModel";
import { type views } from "@/src/features/query/types";

export interface MeasureMeta {
  unit?: string;
  type?: string;
  description?: string;
}

export const getMeasureMeta = (
  view: keyof typeof viewDeclarations,
  measure: string,
): MeasureMeta => {
  const viewDecl = viewDeclarations[view as keyof typeof viewDeclarations];
  if (!viewDecl) return {};
  const measureDecl =
    viewDecl.measures[
      measure as keyof typeof viewDecl.measures
    ] as unknown as { unit?: string; type?: string; description?: string };
  if (!measureDecl) return {};
  const { unit, type, description } = measureDecl;
  return { unit, type, description };
};
