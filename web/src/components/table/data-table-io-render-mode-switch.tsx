import useLocalStorage from "@/src/components/useLocalStorage";

/**
 * Controls how I/O cells render their value:
 * - "json": multi-line, syntax-highlighted JSON tree (IOTableCell singleLine=false)
 * - "text": compact formatted string preview (IOTableCell singleLine=true)
 */
export type IoRenderMode = "json" | "text";

export function useIoRenderModeLocalStorage(
  tableName: string,
  defaultValue: IoRenderMode,
) {
  const [ioRenderMode, setIoRenderMode, clearIoRenderMode] =
    useLocalStorage<IoRenderMode>(`${tableName}IoRenderMode`, defaultValue);

  return [ioRenderMode, setIoRenderMode, clearIoRenderMode] as const;
}
