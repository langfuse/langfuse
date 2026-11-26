import useLocalStorage from "@/src/components/useLocalStorage";

const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Dismissal state persisted in localStorage. Every caller with the same `id`
 * and `family` shares it, so a page can react to a dismissal made inside a
 * `DismissController`.
 */
export function useDismissState({
  id,
  family,
  ttlMs = DEFAULT_TTL_MS,
}: {
  id: string;
  family: "callouts";
  ttlMs?: number;
}) {
  const [dismissedItems, setDismissedItems] = useLocalStorage<DismissedItem[]>(
    `${id}-dismissed-${family}`,
    [],
  );
  const dismissedItem = dismissedItems.find((item) => item.id === id);
  const isDismissed =
    dismissedItem !== undefined &&
    Date.now() - dismissedItem.dismissedAt <= ttlMs;

  const dismiss = () => {
    setDismissedItems((currentItems) => [
      ...currentItems.filter((item) => item.id !== id),
      { id, dismissedAt: Date.now() },
    ]);
  };

  return { isDismissed, dismiss };
}

type DismissedItem = {
  id: string;
  dismissedAt: number;
};
