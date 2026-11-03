/** Custom origins are for self-hosted Langfuse. The DEV region (local
 * development and previews) keeps them testable. */
export function isCustomGatewayProviderAvailable(
  cloudRegion: string | undefined,
): boolean {
  return !cloudRegion || cloudRegion === "DEV";
}
