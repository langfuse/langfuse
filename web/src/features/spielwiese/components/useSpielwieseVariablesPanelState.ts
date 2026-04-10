import { useState } from "react";
import type { SpielwieseVariableVM } from "../types/dashboard";
import {
  createVariableItem,
  type EditableVariableField,
} from "./spielwieseVariablesPanelState";

export type SpielwieseVariablesPanelState = {
  items: SpielwieseVariableVM[];
  onChange: (
    id: SpielwieseVariableVM["id"],
    field: EditableVariableField,
    value: string,
  ) => void;
  onCreate: () => void;
  onDelete: (id: SpielwieseVariableVM["id"]) => void;
};

export function useSpielwieseVariablesPanelState(
  initialItems: SpielwieseVariableVM[],
): SpielwieseVariablesPanelState {
  const [items, setItems] = useState(() =>
    initialItems.map((item) => ({ ...item })),
  );

  const onChange = (
    id: SpielwieseVariableVM["id"],
    field: EditableVariableField,
    value: string,
  ) => {
    setItems((currentItems) =>
      currentItems.map((item) =>
        item.id === id ? { ...item, [field]: value } : item,
      ),
    );
  };

  const onCreate = () => {
    setItems((currentItems) => [...currentItems, createVariableItem()]);
  };

  const onDelete = (id: SpielwieseVariableVM["id"]) => {
    setItems((currentItems) => currentItems.filter((item) => item.id !== id));
  };

  return { items, onChange, onCreate, onDelete };
}
