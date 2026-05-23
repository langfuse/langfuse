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
      className="absolute inset-x-0 top-0 h-px overflow-hidden bg-[rgba(36,37,41,0.08)]"
      role="progressbar"
    >
      <div
        className="h-full bg-[rgba(36,37,41,0.46)] transition-[width] duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]"
        style={{ width: `${normalizedValue}%` }}
      />
    </div>
  );
}
