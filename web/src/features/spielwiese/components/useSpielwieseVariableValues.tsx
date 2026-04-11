import { createContext, type ReactNode, useContext } from "react";
import type { SpielwieseVariableVM } from "../types/dashboard";

const emptyVariableValues: Record<string, string> = {};

const SpielwieseVariableValuesContext = createContext(emptyVariableValues);

function getVariableValues(items: SpielwieseVariableVM[]) {
  return items.reduce<Record<string, string>>((values, item) => {
    const variableName = item.label.trim();

    if (!variableName || !item.helper.trim()) {
      return values;
    }

    return {
      ...values,
      [variableName]: item.helper,
    };
  }, {});
}

export function SpielwieseVariableValuesProvider({
  children,
  items,
}: {
  children: ReactNode;
  items: SpielwieseVariableVM[];
}) {
  return (
    <SpielwieseVariableValuesContext.Provider value={getVariableValues(items)}>
      {children}
    </SpielwieseVariableValuesContext.Provider>
  );
}

export function useSpielwieseVariableValues() {
  return useContext(SpielwieseVariableValuesContext);
}
