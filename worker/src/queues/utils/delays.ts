export const delayInMs = (attempt: number) => {
  const range = {
    minMinutes: 1,
    maxMinutes: 10 + attempt * 5, // add a delay the more attempts we have
  };

  const delay = Math.floor(
    Math.random() * (range.maxMinutes - range.minMinutes + 1) +
      range.minMinutes,
  );

  return delay * 60 * 1000;
};
