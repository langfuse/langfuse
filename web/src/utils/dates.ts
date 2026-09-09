export const setBeginningOfDay = (date: Date) => {
  const newDate = new Date(date);
  newDate.setHours(0, 0, 0, 0);
  return newDate;
};

export const setEndOfDay = (date: Date) => {
  const newDate = new Date(date);
  newDate.setHours(23, 59, 59, 999);
  return newDate;
};

export const formatIntervalSeconds = (seconds: number, scale = 2) => {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const pad = (num: number) => String(num).padStart(2, "0");

  if (hrs > 0) return `${hrs}h ${pad(mins)}m ${pad(secs)}s`;
  if (mins > 0) return `${mins}m ${pad(secs)}s`;
  return `${seconds.toFixed(scale)}s`;
};

export const formatApproximateDuration = (secondsRemaining: number) => {
  const seconds = Math.max(1, secondsRemaining);

  if (seconds < 60) {
    return `${seconds} second${seconds === 1 ? "" : "s"}`;
  }

  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  }

  const hours = Math.ceil(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"}`;
};

type Accuracy = "day" | "hour" | "minute" | "second" | "millisecond";

export const formatLocalIsoDate = (
  date: Date,
  useUTC = false,
  pAccuracy: Accuracy,
) => {
  const pad = (num: number) => String(num).padStart(2, "0");

  const year = useUTC ? date.getUTCFullYear() : date.getFullYear();
  const month = useUTC ? date.getUTCMonth() + 1 : date.getMonth() + 1;
  const day = useUTC ? date.getUTCDate() : date.getDate();
  const hours = useUTC ? date.getUTCHours() : date.getHours();
  const minutes = useUTC ? date.getUTCMinutes() : date.getMinutes();
  const seconds = useUTC ? date.getUTCSeconds() : date.getSeconds();
  const ms = useUTC ? date.getUTCMilliseconds() : date.getMilliseconds();

  let formatted = `${year}-${pad(month)}-${pad(day)}`;

  if (["hour", "minute", "second", "millisecond"].includes(pAccuracy)) {
    formatted += ` ${pad(hours)}`;
  }
  if (["minute", "second", "millisecond"].includes(pAccuracy)) {
    formatted += `:${pad(minutes)}`;
  }
  if (["second", "millisecond"].includes(pAccuracy)) {
    formatted += `:${pad(seconds)}`;
  }
  if (pAccuracy === "millisecond") {
    formatted += `.${String(ms).padStart(3, "0")}`;
  }

  return formatted;
};

export const buildLocalIsoDatePresentation = ({
  date,
  accuracy = "second",
}: {
  date: unknown;
  accuracy?: Accuracy;
}) => {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    return null;
  }

  return {
    display: formatLocalIsoDate(date, false, accuracy),
    title: `UTC: ${formatLocalIsoDate(date, true, "millisecond")}`,
  };
};

export const getShortLocalTimezone = () => {
  return new Date()
    .toLocaleTimeString("en-us", { timeZoneName: "short" })
    .split(" ")[2];
};

export const getTimezoneDetails = () => {
  const longLocalTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const location = longLocalTz.replace(/_/g, " ");
  const utcDifference = -(new Date().getTimezoneOffset() / 60); // negative because TZ info is the opposite of UTC offset
  return `${location} (UTC${utcDifference >= 0 ? "+" : ""}${utcDifference})`;
};

// Compact relative time: "just now", "3m ago", "5h ago", "15d ago",
// "2mo ago", "1y ago" — largest sensible unit, no live refresh implied.
export const formatCompactRelativeTime = (timestamp: Date): string => {
  const diffInSeconds = Math.max(0, (Date.now() - timestamp.getTime()) / 1000);
  if (diffInSeconds < 60) return "just now";
  const minutes = diffInSeconds / 60;
  if (minutes < 60) return `${Math.floor(minutes)}m ago`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.floor(hours)}h ago`;
  const days = hours / 24;
  if (days < 30) return `${Math.floor(days)}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
};

export const getRelativeTimestampFromNow = (timestamp: Date): string => {
  const diffInMs = Math.max(0, new Date().getTime() - timestamp.getTime());
  const diffInMinutes = diffInMs / (1000 * 60);
  const diffInHours = diffInMinutes / 60;
  const diffInDays = diffInHours / 24;

  if (diffInHours < 1) {
    return `${Math.floor(diffInMinutes)} minutes ago`;
  } else if (diffInHours < 24) {
    return `${Math.floor(diffInHours)} hours ago`;
  } else if (diffInDays < 7) {
    return `${Math.floor(diffInDays)} days ago`;
  }
  return timestamp.toLocaleDateString("en-US", {
    year: "2-digit",
    month: "numeric",
    day: "numeric",
  });
};
