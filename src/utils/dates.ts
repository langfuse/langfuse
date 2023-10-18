export const utcDateOffsetByDays = (days: number) => {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
};

export const setBeginningOfDay = (date: Date) => {
  date.setHours(0, 0, 0, 0);
  return date;
};

export const setEndOfDay = (date: Date) => {
  date.setHours(23, 59, 59, 999);
  return date;
};
