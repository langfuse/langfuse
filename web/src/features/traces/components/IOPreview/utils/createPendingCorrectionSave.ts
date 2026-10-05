/** Keeps a pending save bound to the editor and record that scheduled it. */
export function createPendingCorrectionSave() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: (() => void) | undefined;

  function schedule(save: () => void, delay: number) {
    cancel();
    pending = save;
    timer = setTimeout(flush, delay);
  }

  function flush() {
    const save = pending;
    cancel();
    save?.();
  }

  function cancel() {
    clearTimeout(timer);
    timer = undefined;
    pending = undefined;
  }

  return { schedule, flush, cancel };
}
