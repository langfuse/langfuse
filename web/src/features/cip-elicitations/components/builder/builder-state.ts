// CIP fork feature (see FORK.md): builder-local state.
//
// HeyForm's pattern (concepts only): a reducer holds the draft field array and
// the current selection; every mutation bumps `revision`, which a debounced
// effect flushes to `elicitations.updateDraft` with optimistic-concurrency
// `version` checking.
import {
  blankField,
  newFieldId,
  type FieldKind,
  type FormField,
  type FormSettings,
} from "../../lib/contract";

export type SaveState = "saved" | "saving" | "dirty" | "conflict" | "error";

export type BuilderState = {
  fields: FormField[];
  settings: FormSettings;
  selectedId: string | null;
  /** Server row version for optimistic concurrency. */
  version: number;
  /** Bumped on every local edit; the autosave effect watches it. */
  revision: number;
  saveState: SaveState;
};

export type BuilderAction =
  | {
      type: "init";
      fields: FormField[];
      settings: FormSettings;
      version: number;
    }
  | { type: "select"; id: string }
  | { type: "addField"; kind: FieldKind }
  | { type: "updateField"; id: string; patch: Partial<FormField> }
  | { type: "removeField"; id: string }
  | { type: "duplicateField"; id: string }
  | { type: "reorder"; ids: string[] }
  | { type: "updateSettings"; patch: Partial<FormSettings> }
  | { type: "saveStarted" }
  | { type: "saveSucceeded"; version: number }
  | { type: "saveFailed"; conflict: boolean };

/** Where a new field lands: after the selection, but never after a thank-you tail. */
function insertionIndex(fields: FormField[], selectedId: string | null) {
  const selectedIdx = fields.findIndex((f) => f.id === selectedId);
  if (selectedIdx >= 0) return selectedIdx + 1;
  const firstThankYou = fields.findIndex((f) => f.kind === "thank_you");
  return firstThankYou >= 0 ? firstThankYou : fields.length;
}

const edited = (state: BuilderState): BuilderState => ({
  ...state,
  revision: state.revision + 1,
  saveState: state.saveState === "conflict" ? "conflict" : "dirty",
});

export function builderReducer(
  state: BuilderState,
  action: BuilderAction,
): BuilderState {
  switch (action.type) {
    case "init":
      return {
        fields: action.fields,
        settings: action.settings,
        selectedId: action.fields[0]?.id ?? null,
        version: action.version,
        revision: 0,
        saveState: "saved",
      };
    case "select":
      return { ...state, selectedId: action.id };
    case "addField": {
      const field = blankField(action.kind, newFieldId());
      const idx = insertionIndex(state.fields, state.selectedId);
      const fields = [...state.fields];
      fields.splice(idx, 0, field);
      return { ...edited(state), fields, selectedId: field.id };
    }
    case "updateField": {
      const fields = state.fields.map((f) =>
        f.id === action.id ? { ...f, ...action.patch } : f,
      );
      return { ...edited(state), fields };
    }
    case "removeField": {
      const fields = state.fields.filter((f) => f.id !== action.id);
      const selectedId =
        state.selectedId === action.id
          ? (fields[0]?.id ?? null)
          : state.selectedId;
      return { ...edited(state), fields, selectedId };
    }
    case "duplicateField": {
      const source = state.fields.find((f) => f.id === action.id);
      if (!source) return state;
      const copy: FormField = structuredClone(source);
      copy.id = newFieldId();
      const idx = state.fields.findIndex((f) => f.id === action.id) + 1;
      const fields = [...state.fields];
      fields.splice(idx, 0, copy);
      return { ...edited(state), fields, selectedId: copy.id };
    }
    case "reorder": {
      const byId = new Map(state.fields.map((f) => [f.id, f]));
      const fields = action.ids
        .map((id) => byId.get(id))
        .filter((f): f is FormField => f !== undefined);
      if (fields.length !== state.fields.length) return state;
      return { ...edited(state), fields };
    }
    case "updateSettings":
      return {
        ...edited(state),
        settings: { ...state.settings, ...action.patch },
      };
    case "saveStarted":
      return { ...state, saveState: "saving" };
    case "saveSucceeded":
      return {
        ...state,
        version: action.version,
        // Edits made while the save was in flight keep the state dirty.
        saveState: state.saveState === "saving" ? "saved" : state.saveState,
      };
    case "saveFailed":
      return { ...state, saveState: action.conflict ? "conflict" : "error" };
    default:
      return state;
  }
}

/** Convenience helper to patch nested `properties` immutably. */
export function patchProperties(
  field: FormField,
  patch: Partial<NonNullable<FormField["properties"]>>,
): Partial<FormField> {
  return { properties: { ...field.properties, ...patch } };
}
