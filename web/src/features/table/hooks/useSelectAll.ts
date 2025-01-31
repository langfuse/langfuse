import useSessionStorage from "@/src/components/useSessionStorage";

export function useSelectAll(projectId: string, tableName: string) {
  const [selectAll, setSelectAll] = useSessionStorage<boolean>(
    `selectAll-${projectId}-${tableName}`,
    false,
  );

  return { selectAll, setSelectAll };
}
