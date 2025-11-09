/**
 * Migrates temporary playground cache from localStorage to sessionStorage.
 * This must run BEFORE React components mount to ensure cache is available.
 *
 * Background:
 * When opening playground in a new tab via "Fresh playground" button,
 * we store data temporarily in localStorage (since sessionStorage doesn't
 * transfer to new tabs). This function checks for that temp data on page load
 * and migrates it to sessionStorage where the playground expects it.
 */
export function migrateTempCacheIfNeeded(): string | null {
  if (typeof window === "undefined") return null;

  console.log("[TempCache] Checking for temporary cache...");

  // Find all temporary cache keys
  const tempCacheKeys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith("playground-temp-cache-")) {
      tempCacheKeys.push(key);
    }
  }

  console.log(
    `[TempCache] Found ${tempCacheKeys.length} temp cache keys:`,
    tempCacheKeys,
  );

  // No temp cache found
  if (tempCacheKeys.length === 0) {
    console.log("[TempCache] No temp cache found, skipping migration");
    return null;
  }

  // Process the first temp cache (there should typically only be one)
  const tempKey = tempCacheKeys[0];
  let windowId: string | null = null;

  try {
    const tempCacheData = localStorage.getItem(tempKey);
    if (tempCacheData) {
      // Extract the window ID from the temp key
      // Format: "playground-temp-cache-{windowId}"
      windowId = tempKey.replace("playground-temp-cache-", "");
      const cacheKey = `langfuse-playgroundCache_${windowId}`;

      // Clear any existing playground data first
      clearPlaygroundSessionStorage();

      // Migrate cache from localStorage to sessionStorage
      sessionStorage.setItem(cacheKey, tempCacheData);

      // Also set the window IDs list (use the correct key without "langfuse-" prefix)
      sessionStorage.setItem("playgroundWindowIds", JSON.stringify([windowId]));

      console.log(
        `[TempCache] Migrated ${tempKey} → ${cacheKey} and set windowIds`,
      );
    }
  } catch (error) {
    console.error(`[TempCache] Failed to migrate ${tempKey}:`, error);
    windowId = null;
  } finally {
    // Clean up ALL temporary cache keys from localStorage
    tempCacheKeys.forEach((key) => {
      try {
        localStorage.removeItem(key);
        console.log(`[TempCache] Cleaned up ${key}`);
      } catch (error) {
        console.error(`[TempCache] Failed to cleanup ${key}:`, error);
      }
    });
  }

  return windowId;
}

/**
 * Clears all playground-related data from sessionStorage
 */
function clearPlaygroundSessionStorage() {
  const keysToRemove: string[] = [];

  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (key?.startsWith("langfuse-playground")) {
      keysToRemove.push(key);
    }
  }

  keysToRemove.forEach((key) => {
    sessionStorage.removeItem(key);
  });
}
