export function areDestinationUrlsEquivalent(
  firstUrl: string,
  secondUrl: string,
): boolean {
  try {
    return new URL(firstUrl).href === new URL(secondUrl).href;
  } catch {
    return firstUrl === secondUrl;
  }
}

type StorageDestination = {
  type: string;
  bucketName: string;
  endpoint: string | null;
  accessKeyId: string | null;
};

// A stored storage secret may only be reused for the destination it was
// entered for.
export function isSameStorageDestination(
  existing: StorageDestination,
  next: StorageDestination,
): boolean {
  const isSameEndpoint =
    existing.endpoint === null || next.endpoint === null
      ? existing.endpoint === next.endpoint
      : areDestinationUrlsEquivalent(existing.endpoint, next.endpoint);

  return (
    isSameEndpoint &&
    existing.type === next.type &&
    existing.bucketName === next.bucketName &&
    existing.accessKeyId === next.accessKeyId
  );
}
