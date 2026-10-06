/**
 * Shared pre-complete steps for annotation queue "Mark Completed" (button and
 * keyboard). Mirrors numeric blur persistence: flush unsaved score-comment
 * drafts, then blur a focused score field so its save mutation fires.
 */
export function prepareAnnotationQueueComplete(options: {
  flushPendingEdits?: () => void;
}): boolean {
  const invalidNumber = document.querySelector<HTMLInputElement>(
    '[data-annotation-form] input[type="number"]:invalid',
  );
  if (invalidNumber) {
    invalidNumber.focus();
    invalidNumber.reportValidity();
    return false;
  }

  options.flushPendingEdits?.();

  const active = document.activeElement;
  if (
    active instanceof HTMLTextAreaElement ||
    active instanceof HTMLInputElement
  ) {
    active.blur();
  }

  return true;
}
