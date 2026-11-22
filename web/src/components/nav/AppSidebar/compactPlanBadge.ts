/** Pixel of slack so scrollWidth vs getBoundingClientRect rounding cannot flip the badge. */
const EXPAND_MARGIN_PX = 1;

type CompactPlanBadgeMeasurement = {
  compact: boolean;
  nameScrollWidth: number;
  nameClientWidth: number;
  /**
   * Distance from the badge's right edge to the chevron. Includes the flex
   * gap, which stays when the badge grows and is not room for a wider label.
   */
  freeSpace: number;
  fullBadgeWidth: number;
  currentBadgeWidth: number;
  /** Horizontal flex gap on the org switcher trigger, in px. */
  gapPx: number;
};

/**
 * Short label while the full one truncates the org name. Expanding subtracts
 * the flex gap and a pixel of slack: counting the gap as spare width flips
 * the badge forever when the name is within about one gap of fitting.
 */
export function nextCompactPlanBadge(
  measurement: CompactPlanBadgeMeasurement,
): boolean {
  const nameTruncated =
    measurement.nameScrollWidth > measurement.nameClientWidth;
  if (!measurement.compact) return nameTruncated;

  const extraForFull =
    measurement.fullBadgeWidth - measurement.currentBadgeWidth;
  const roomForFull =
    measurement.freeSpace - measurement.gapPx - EXPAND_MARGIN_PX;
  const nameFits = !nameTruncated;
  if (nameFits && roomForFull >= extraForFull) return false;
  return true;
}
