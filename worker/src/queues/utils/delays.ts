export const delayInMs = (
  range: { minMinutes: number; maxMinutes: number } = {
    minMinutes: 1,
    maxMinutes: 10,
  },
) => {
  const delay = Math.floor(
    Math.random() * (range.maxMinutes - range.minMinutes + 1) +
      range.minMinutes,
  );

  return delay * 60 * 1000;
};
