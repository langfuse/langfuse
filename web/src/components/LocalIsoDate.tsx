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

export const LocalIsoDate = ({
  date,
  accuracy = "second",
  className,
}: {
  date: Date;
  accuracy?: Accuracy;
  className?: string;
}) => {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    return null;
  }

  const localDateString = formatLocalIsoDate(date, false, accuracy);
  const utcDateString = formatLocalIsoDate(date, true, "millisecond");

  return (
    <span title={`UTC: ${utcDateString}`} className={className}>
      {localDateString}
    </span>
  );
};
