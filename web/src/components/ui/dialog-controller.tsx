"use client";

import { type ReactNode, useCallback, useState } from "react";

export function DialogController<T>({
  children,
  dialog,
}: {
  children: (control: { open: (value: T) => void }) => ReactNode;
  dialog: (close: () => void, value: T | null) => ReactNode;
}) {
  const [value, setValue] = useState<T | null>(null);
  const open = useCallback((nextValue: T) => setValue(nextValue), []);
  const close = useCallback(() => setValue(null), []);

  return (
    <>
      {dialog(close, value)}
      {children({ open })}
    </>
  );
}
