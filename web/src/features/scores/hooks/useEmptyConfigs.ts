import useLocalStorage from "@/src/components/useLocalStorage";

export function useEmptyConfigs() {
  const [emptySelectedConfigIds, setEmptySelectedConfigIds] = useLocalStorage<
    string[]
  >("emptySelectedConfigIds", []);

  return { emptySelectedConfigIds, setEmptySelectedConfigIds };
}
