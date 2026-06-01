export const modelPricingInclude = {
  pricingTiers: {
    select: {
      id: true,
      name: true,
      isDefault: true,
      priority: true,
      conditions: true,
      prices: {
        select: {
          usageType: true,
          price: true,
        },
      },
    },
    orderBy: { priority: "asc" as const },
  },
};
