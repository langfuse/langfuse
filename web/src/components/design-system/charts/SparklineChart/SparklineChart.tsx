import { type SparklinePlot } from "./prepareSparkline";

/** A static, axis-free chart for summaries that already have their own labels. */
export function SparklineChart({
  plot,
  label,
  size,
}: {
  plot: SparklinePlot;
  label: string;
  size: "sm" | "md";
}) {
  return (
    <svg
      viewBox={`0 0 ${plot.width} ${plot.height}`}
      preserveAspectRatio="none"
      className={
        size === "sm"
          ? "text-primary block h-6 w-full"
          : "text-primary block h-9 w-full"
      }
      role="img"
      aria-label={label}
    >
      {plot.lines.map((line, index) => (
        <g key={index}>
          <path d={line.area} fill="currentColor" opacity={0.08} />
          <path
            d={line.path}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />
        </g>
      ))}
      {plot.points.map((point, index) => (
        <circle
          key={index}
          cx={point.x}
          cy={point.y}
          r={1.5}
          fill="currentColor"
        />
      ))}
    </svg>
  );
}
