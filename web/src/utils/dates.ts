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

export const intervalInSeconds = (start: Date, end: Date | null) =>
  end ? (end.getTime() - start.getTime()) / 1000 : 0;

export const formatIntervalSeconds = (seconds: number, scale: number = 2) => {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const pad = (num: number) => `00${num}`.slice(2);

  if (hrs > 0) return `${hrs}h ${pad(mins)}m ${pad(secs)}s`;
  if (mins > 0) return `${mins}m ${pad(secs)}s`;
  return `${seconds.toFixed(scale)}s`;
};
