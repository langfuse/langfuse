/** Priority is derived from tier order, so it can never drift or collide. */
export const derivePriorities = (tiers: { isDefault: boolean }[]): number[] => {
  let next = 1;
  return tiers.map((tier) => (tier.isDefault ? 0 : next++));
};
