export const TotalMetric = ({
  metric,
  description,
}: {
  metric: string;
  description?: string;
}) => {
  return (
    <>
      <div className="text-2xl font-bold">{metric}</div>
      {description ? (
        <p className="text-xs text-muted-foreground">{description}</p>
      ) : undefined}
    </>
  );
};
