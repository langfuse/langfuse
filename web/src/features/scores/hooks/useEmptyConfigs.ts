import useLocalStorage from "@/src/components/useLocalStorage";

export function useEmptyScoreConfigs(storageKey = "emptySelectedConfigIds") {
  const [emptySelectedConfigIds, setEmptySelectedConfigIds] = useLocalStorage<
    string[]
  >(storageKey, []);

  return { emptySelectedConfigIds, setEmptySelectedConfigIds };
}
