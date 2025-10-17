import useLocalStorage from "@/src/components/useLocalStorage";

export function useEmptyScoreConfigs() {
  const [emptySelectedConfigIds, setEmptySelectedConfigIds] = useLocalStorage<
    string[]
  >("emptySelectedConfigIds", []);

  return { emptySelectedConfigIds, setEmptySelectedConfigIds };
}
