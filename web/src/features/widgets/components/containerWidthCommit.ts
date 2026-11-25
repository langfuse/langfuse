/**
 * Whether a newly measured container width should be published to the grid.
 *
 * Short resizes commit on every sample so the grid tracks its own box. Once
 * the resize outlives `settleMs * 3`, commits drop to the settle interval so
 * a long window drag does not rebuild every chart at frame rate. The caller
 * still commits the final width when the container stops changing.
 */
export function nextContainerWidthCommit(args: {
  now: number;
  gestureStartedAt: number;
  lastCommittedAt: number;
  pendingWidth: number;
  committedWidth: number | null;
  settleMs: number;
}): { kind: "commit"; width: number } | { kind: "defer" } {
  if (args.committedWidth === args.pendingWidth) return { kind: "defer" };

  const followWindowMs = args.settleMs * 3;
  const withinFollowWindow = args.now - args.gestureStartedAt <= followWindowMs;
  const coarseIntervalElapsed =
    args.now - args.lastCommittedAt >= args.settleMs;
  if (withinFollowWindow || coarseIntervalElapsed) {
    return { kind: "commit", width: args.pendingWidth };
  }
  return { kind: "defer" };
}
