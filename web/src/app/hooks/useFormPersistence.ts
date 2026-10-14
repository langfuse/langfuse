import { useEffect, useRef, useCallback, useState } from "react";
import { type UseFormReturn } from "react-hook-form";
import { useDebounce } from "./useDebounce";

const getStorageKey = (projectId: string, formId: string) =>
  `langfuse:form-draft:${projectId}:${formId}`;

export interface UseFormPersistenceOptions<T extends Record<string, unknown>> {
  formId: string;
  projectId: string;
  form: UseFormReturn<T>;
  debounceMs?: number;
  enabled?: boolean;
  onDraftRestored?: (draft: Partial<T>) => void;
}

export interface UseFormPersistenceReturn {
  hadDraft: boolean;
  hasDraft: boolean;
  clearDraft: () => void;
}

export function useFormPersistence<T extends Record<string, unknown>>({
  formId,
  projectId,
  form,
  debounceMs = 350,
  enabled = true,
  onDraftRestored,
}: UseFormPersistenceOptions<T>): UseFormPersistenceReturn {
  const storageKey = getStorageKey(projectId, formId);
  const [hadDraft, setHadDraft] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const isInitialized = useRef(false);
  const lastSaved = useRef<string | null>(null);
  const onDraftRestoredRef = useRef(onDraftRestored);
  onDraftRestoredRef.current = onDraftRestored;

  // Restore on mount (once)
  useEffect(() => {
    if (!enabled || isInitialized.current) return;
    isInitialized.current = true;

    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) {
        const draft = JSON.parse(saved) as Partial<T>;
        const current = form.getValues();
        form.reset({ ...current, ...draft } as T, {
          keepDirty: true,
          keepTouched: true,
        });
        setHadDraft(true);
        setHasDraft(true);
        onDraftRestoredRef.current?.(draft);
      }
    } catch {
      sessionStorage.removeItem(storageKey);
    }
  }, [enabled, storageKey, form]);

  // Save on change (debounced)
  const saveDraft = useDebounce(
    (values: T) => {
      const serialized = JSON.stringify(values);
      if (serialized === lastSaved.current) return;
      try {
        sessionStorage.setItem(storageKey, serialized);
        lastSaved.current = serialized;
        setHasDraft(true);
      } catch {
        /* storage full - ignore */
      }
    },
    debounceMs,
    false,
  );

  useEffect(() => {
    if (!enabled) return;
    const sub = form.watch((values) => {
      if (form.formState.isDirty) saveDraft(values as T);
    });
    return () => sub.unsubscribe();
  }, [form, enabled, saveDraft]);

  const clearDraft = useCallback(() => {
    sessionStorage.removeItem(storageKey);
    lastSaved.current = null;
    setHasDraft(false);
    setHadDraft(false);
  }, [storageKey]);

  return { hadDraft, hasDraft, clearDraft };
}
