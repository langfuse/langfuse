export function formatDate(date: Date): string {
  const options: Intl.DateTimeFormatOptions = {
    year: undefined,
    month: "numeric",
    day: "numeric",
    weekday: undefined,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: undefined,
    hour12: false,
  };

  return new Intl.DateTimeFormat("en-US", options).format(date);
}
