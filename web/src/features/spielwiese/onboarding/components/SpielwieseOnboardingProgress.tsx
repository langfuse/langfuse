type SpielwieseOnboardingProgressProps = {
  value: number;
};

export function SpielwieseOnboardingProgress({
  value,
}: SpielwieseOnboardingProgressProps) {
  const normalizedValue = Math.max(0, Math.min(100, value));

  return (
    <div
      aria-label={`${Math.round(normalizedValue)}%`}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={normalizedValue}
      className="absolute inset-x-0 top-0 h-0.5 overflow-hidden bg-[rgb(230,231,234)]"
      role="progressbar"
    >
      <div
        className="h-full bg-[rgb(38,109,240)]"
        style={{ width: `${normalizedValue}%` }}
      />
    </div>
  );
}
