// Comment drafts live on the open annotation form until Save Changes.
// Queue completion unmounts that form, so it asks every open form to
// write a draft that has not been saved yet.
const flushes = new Set<() => void>();

export function registerPendingAnnotationCommentFlush(flush: () => void) {
  flushes.add(flush);
  return () => {
    flushes.delete(flush);
  };
}

export function flushPendingAnnotationComments() {
  for (const flush of flushes) flush();
}
