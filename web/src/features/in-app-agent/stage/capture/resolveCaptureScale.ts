/**
 * Texture budgets. Phones share memory with a small GPU and commonly cap
 * textures at 4096px, so they get a tighter pixel budget than desktops.
 */
export const CAPTURE_LIMITS = {
  maxDevicePixelRatio: 2,
  minScale: 0.5,
  desktop: { maxPixels: 3840 * 2160, maxSide: 8192 },
  handheld: { maxPixels: 2048 * 2048, maxSide: 4096 },
} as const;

/**
 * The pixel ratio to capture the page at: the device pixel ratio for crisp
 * text, capped so the texture fits the GPU's limit and the memory budget.
 */
export function resolveCaptureScale(params: {
  cssWidth: number;
  cssHeight: number;
  devicePixelRatio: number;
  maxTextureSize: number | null;
  isHandheld: boolean;
}): number {
  const { cssWidth, cssHeight } = params;
  if (cssWidth <= 0 || cssHeight <= 0) {
    return 1;
  }
  const limits = params.isHandheld
    ? CAPTURE_LIMITS.handheld
    : CAPTURE_LIMITS.desktop;
  const maxSide = Math.min(
    limits.maxSide,
    params.maxTextureSize ?? limits.maxSide,
  );
  const scale = Math.min(
    params.devicePixelRatio > 0 ? params.devicePixelRatio : 1,
    CAPTURE_LIMITS.maxDevicePixelRatio,
    maxSide / cssWidth,
    maxSide / cssHeight,
    Math.sqrt(limits.maxPixels / (cssWidth * cssHeight)),
  );
  return Math.max(CAPTURE_LIMITS.minScale, Math.floor(scale * 100) / 100);
}
