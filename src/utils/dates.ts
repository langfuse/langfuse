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

export const formatInterval = (seconds: number) => {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);

  const pad = (num: number, digits?: number) =>
    `${"0".repeat(digits ?? 2)}${num}`.slice(-(digits ?? 2));
  return (
    `${pad(hrs)}:${pad(mins)}:${pad(secs)}.${pad(ms, 3)}`
      // dynamically remove leading zeros
      .replace(/^0+:/, "")
      .replace(/^0+:/, "")
      // if the time is less than 1 minute, remove the leading zeros from the seconds
      // make sure to only match 00.xxx and not 00:00.xxx
      .replace(/^00\./, "0.") +
    // if the time is less than 1 minute, add a s at the end
    (seconds < 60 ? "s" : "")
  );
};
