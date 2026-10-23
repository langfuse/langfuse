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
