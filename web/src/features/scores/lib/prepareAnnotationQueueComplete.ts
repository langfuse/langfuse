/**
 * Shared pre-complete steps for annotation queue "Mark Completed" (button and
 * keyboard). Blur a focused score field to start its save, then flush comment
 * drafts and wait for all score saves before allowing completion.
 */
export async function prepareAnnotationQueueComplete(options: {
  flushPendingEdits?: () => Promise<boolean> | undefined;
}): Promise<boolean> {
  const invalidNumber = document.querySelector<HTMLInputElement>(
    '[data-annotation-form] input[type="number"]:invalid',
  );
  if (invalidNumber) {
    invalidNumber.focus();
    invalidNumber.reportValidity();
    return false;
  }

  const active = document.activeElement;
  if (
    active instanceof HTMLTextAreaElement ||
    active instanceof HTMLInputElement
  ) {
    active.blur();
  }

  return (await options.flushPendingEdits?.()) ?? true;
}
