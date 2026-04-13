const ROLE_HANDOFF_TUNING = {
  cardLiftDistanceY: 75,
  cardShrinkInsetX: 50,
};

export type RoleHandoffDebugConfig = {
  cardLiftDistanceY: number;
  cardShrinkInsetX: number;
  freezeAtLift: boolean;
};

export function getRoleHandoffDebugConfig(): RoleHandoffDebugConfig {
  if (typeof window === "undefined") {
    return {
      cardLiftDistanceY: ROLE_HANDOFF_TUNING.cardLiftDistanceY,
      cardShrinkInsetX: ROLE_HANDOFF_TUNING.cardShrinkInsetX,
      freezeAtLift: false,
    };
  }

  const searchParams = new URLSearchParams(window.location.search);
  const parsedLiftY = Number(
    searchParams.get("debugRoleLiftY") ??
      String(ROLE_HANDOFF_TUNING.cardLiftDistanceY),
  );
  const parsedShrinkInsetX = Number(
    searchParams.get("debugRoleShrinkX") ??
      String(ROLE_HANDOFF_TUNING.cardShrinkInsetX),
  );

  return {
    cardLiftDistanceY: Number.isFinite(parsedLiftY)
      ? parsedLiftY
      : ROLE_HANDOFF_TUNING.cardLiftDistanceY,
    cardShrinkInsetX: Number.isFinite(parsedShrinkInsetX)
      ? parsedShrinkInsetX
      : ROLE_HANDOFF_TUNING.cardShrinkInsetX,
    freezeAtLift:
      searchParams.get("debugFreezeRoleHandoff") === "1" ||
      searchParams.get("debugFreezeMotion") === "1",
  };
}
