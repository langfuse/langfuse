import useLocalStorage from "@/src/app/components/useLocalStorage";

export function useEmptyScoreConfigs(storageKey = "emptySelectedConfigIds") {
  const [emptySelectedConfigIds, setEmptySelectedConfigIds] = useLocalStorage<
    string[]
  >(storageKey, []);

  return { emptySelectedConfigIds, setEmptySelectedConfigIds };
}
