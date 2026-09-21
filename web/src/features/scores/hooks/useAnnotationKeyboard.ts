import { useEffect, type RefObject } from "react";
import type { UseFormReturn } from "react-hook-form";
import type {
  AnnotateFormSchemaType,
  AnnotationScoreSchemaType,
  PreparedAnnotationTarget,
} from "@/src/features/scores/types";
import type { AnnotationFormActions } from "@/src/features/scores/actions/annotationFormActions";
import { annotationFieldKey } from "@/src/features/scores/lib/annotationConfigSelection";
import {
  hasBlockingOverlay,
  hasModifier,
} from "@/src/features/scores/lib/keyboardShortcuts";
import {
  isTextDataType,
  isNumericDataType,
} from "@/src/features/scores/lib/helpers";

export function useAnnotationKeyboard({
  formRootRef,
  form,
  actions,
  targets,
  isActive,
}: {
  formRootRef: RefObject<HTMLDivElement | null>;
  form: UseFormReturn<AnnotateFormSchemaType>;
  actions: AnnotationFormActions;
  targets: PreparedAnnotationTarget[];
  isActive: boolean;
}) {
  // Keyboard navigation uses real DOM focus with a
  // spreadsheet-style navigate-vs-edit split (single source of truth, one
  // outline, never trapped):
  //  - `↑` / `↓` move focus between *rows* (the row container, never into a text
  //    field) so navigation keeps working even when the active row is text.
  //  - `Enter`  drills into the focused row's control (a text/number field to
  //    type, the combobox to open, a toggle to use ←/→).
  //  - `Esc`    pops back out of an editing text field to its row.
  //  - `1`-`9`  pick the Nth option of the focused row (option rows only).
  // A focused text field owns its keys; an open popover/drawer suspends these.
  useEffect(() => {
    if (!isActive) return;
    const targetFor = (field: AnnotationScoreSchemaType) =>
      targets.find((target) => target.key === field.targetKey)!;
    const configFor = (field: AnnotationScoreSchemaType | undefined) =>
      field
        ? targetFor(field).configControl.configs.find(
            (config) => config.id === field.configId,
          )
        : undefined;
    const isKeyboardSelectable = (
      field: AnnotationScoreSchemaType | undefined,
    ) => {
      const config = configFor(field);
      return (
        !!field &&
        !isTextDataType(field.dataType) &&
        !isNumericDataType(field.dataType) &&
        !!config &&
        !config.isArchived &&
        (config.categories?.length ?? 0) > 0
      );
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (hasModifier(event)) return;
      const controlledFields = form.getValues("scoreData");
      const rowCount = controlledFields.filter((field) =>
        configFor(field),
      ).length;

      const root = formRootRef.current;
      if (!root) return;
      // Suspend for an overlapping popover/drawer (e.g. the comment editor), but
      // NOT for a drawer this form is mounted inside (the Annotate drawer) — that
      // is an ancestor of the form, so the scheme stays alive there.
      if (hasBlockingOverlay(root)) return;
      const target = event.target;
      const editing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable);

      // (`Esc` to leave a field is handled by a separate capture-phase listener
      // below, so it can stop a wrapping drawer from also dismissing.)

      // `Enter` in a single-line field (e.g. a numeric score) commits the value
      // and returns to row navigation — there is no newline to insert, so this is
      // the spreadsheet "confirm cell" gesture. Multi-line text (textarea) keeps
      // Enter for newlines and is excluded here.
      if (
        event.key === "Enter" &&
        target instanceof HTMLInputElement &&
        root.contains(target)
      ) {
        // Out-of-range numeric: surface the constraint and stay so the value
        // isn't committed-and-dropped (mirrors the ⌘/Ctrl+Enter complete gate).
        if (
          target.type === "number" &&
          (target.validity.badInput || !target.validity.valid)
        ) {
          event.preventDefault();
          const row = target.closest<HTMLElement>("[data-score-row]");
          if (row) {
            const field = controlledFields[Number(row.dataset.scoreRow)];
            if (field)
              actions.saveNumeric(
                annotationFieldKey(field),
                targetFor(field),
                target,
              );
          }
          target.reportValidity();
          return;
        }
        event.preventDefault();
        const row = target.closest<HTMLElement>("[data-score-row]");
        // Focusing the row blurs the input (its onBlur saves) and resumes ↑/↓.
        if (row) row.focus();
        else target.blur();
        return;
      }

      // While editing a text field, leave its keys (typing, caret, number step)
      // alone — `Esc` / `Tab` move out.
      if (editing) return;
      if (rowCount === 0) return;

      // The form containing focus acts; if focus is on the body the first
      // form acts. A control focused *outside* any form (e.g. the Mark Completed
      // / Skip / Back / "?" page buttons) must NOT drive the form — otherwise
      // ↑/↓ would hijack focus off that button into the score rows.
      const active = document.activeElement;
      const focusedForm =
        active instanceof HTMLElement
          ? active.closest("[data-annotation-form]")
          : null;
      if (focusedForm) {
        if (focusedForm !== root) return;
      } else {
        if (active && active !== document.body) return;
        if (document.querySelector("[data-annotation-form]") !== root) return;
      }

      const rowEls = Array.from(
        root.querySelectorAll<HTMLElement>("[data-score-row]"),
      );
      if (rowEls.length === 0) return;
      const currentRow =
        active instanceof HTMLElement
          ? (active.closest("[data-score-row]") as HTMLElement | null)
          : null;
      const currentPos = currentRow ? rowEls.indexOf(currentRow) : -1;

      // Score action triggers own their menu keyboard navigation.
      if (
        active instanceof HTMLElement &&
        active.closest("[data-score-actions]")
      )
        return;

      // `↑` / `↓` move focus between rows (to the row container itself, never
      // into a text field — so navigation is never trapped).
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        if (rowEls.length < 2) return;
        // Navigate from a focused row, or enter from the body — but NOT from an
        // in-form non-row control (e.g. the config-picker trigger), which would
        // otherwise teleport focus to a row.
        if (currentPos < 0 && active !== document.body) return;
        event.preventDefault();
        const delta = event.key === "ArrowDown" ? 1 : -1;
        let nextPos = (currentPos + delta + rowEls.length) % rowEls.length;
        if (currentPos < 0) nextPos = delta > 0 ? 0 : rowEls.length - 1;
        rowEls[nextPos].focus();
        return;
      }

      // `Enter` drills into the focused row's control (only from the row
      // container itself — once a control is focused, Enter is left to it).
      if (event.key === "Enter") {
        if (currentRow && active === currentRow) {
          // First *enabled* control — skip the disabled stale-category chip that
          // enrichCategoryOptionsWithStaleScoreValue prepends (focusing a disabled
          // control is a no-op, so Enter would otherwise appear to do nothing).
          const control = Array.from(
            currentRow.querySelectorAll<HTMLElement>(
              "[data-score-control] :is(textarea, input, button)",
            ),
          ).find((el) => !el.matches(":disabled"));
          if (control) {
            event.preventDefault();
            // A dropdown trigger (combobox, `aria-haspopup`) opens directly so a
            // single Enter is enough (not focus-then-Enter). Radix's Popover
            // trigger opens on click. Other controls (number/text input, toggle)
            // just take focus.
            if (
              control.tagName === "BUTTON" &&
              control.getAttribute("aria-haspopup")
            ) {
              control.click();
            } else {
              control.focus();
            }
          }
        }
        return;
      }

      // `1`-`9` pick an option on the focused row (option rows only).
      if (/^[1-9]$/.test(event.key)) {
        if (currentPos < 0 || !currentRow) return;
        // Only from the row container itself or its value control — never the
        // in-row comment or score actions (else a stray digit writes a phantom
        // score). Mirrors the Enter branch's `active === currentRow` gate.
        if (
          active !== currentRow &&
          !(
            active instanceof HTMLElement &&
            active.closest("[data-score-control]")
          )
        )
          return;
        const rowIndex = Number(currentRow.getAttribute("data-score-row"));
        const field = controlledFields[rowIndex];
        if (!isKeyboardSelectable(field)) return;
        const config = field ? configFor(field) : undefined;
        const category = (config?.categories ?? [])[Number(event.key) - 1];
        if (!category) return;
        event.preventDefault();
        if (field)
          actions.saveCategory(
            annotationFieldKey(field),
            targetFor(field),
            category.label,
          );
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [actions, form, formRootRef, targets, isActive]);

  // `Esc` leaves a focused score field (back to its row) without
  // dismissing a wrapping drawer. Vaul/Radix DismissableLayer listens for Esc on
  // `document` with `{capture:true}`; a window capture-phase listener runs first
  // (window is the ancestor), so stopping propagation here prevents the drawer
  // from closing. Scoped to fields inside this form (a portaled comment popover
  // is not inside the form root, so its own Esc-to-close still works).
  useEffect(() => {
    if (!isActive) return;
    const onEscapeCapture = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const root = formRootRef.current;
      if (!root) return;
      const target = event.target;
      const inField =
        (target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement) &&
        root.contains(target);
      if (!inField) return;
      event.stopPropagation();
      const row = (target as HTMLElement).closest<HTMLElement>(
        "[data-score-row]",
      );
      if (row) row.focus();
      else (target as HTMLElement).blur();
    };
    window.addEventListener("keydown", onEscapeCapture, true);
    return () => window.removeEventListener("keydown", onEscapeCapture, true);
  }, [formRootRef, isActive]);
}
