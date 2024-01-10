import { useState, useEffect } from "react";

export function useOptimisticUpdate<T>(
  value: T,
  updateFunction: (value: T) => Promise<unknown>,
) {
  const [cachedValue, setCachedValue] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const optimisticValue = cachedValue ?? value;

  useEffect(() => {
    setCachedValue(null);
  }, [value]);

  const handleUpdate = async (newValue: T) => {
    console.log("handleUpdate triggered");
    setLoading(true);
    setCachedValue(newValue);
    await updateFunction(newValue);
    setLoading(false);
  };

  return { optimisticValue, loading, handleUpdate };
}
