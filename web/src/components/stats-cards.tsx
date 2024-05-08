interface Statistic {
  name: string;
  stat: string;
}

export default function StatsCards({ stats }: { stats: Statistic[] }) {
  return (
    <div>
      <h3 className="text-base font-semibold leading-6 text-primary">
        Model configuration
      </h3>
      <dl className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-4">
        {stats.map((item) => (
          <div
            key={item.name}
            className="overflow-hidden rounded-lg bg-background px-4 py-5 shadow sm:p-6"
          >
            <dt className="truncate text-sm font-medium text-muted-foreground">
              {item.name}
            </dt>
            <dd className="mt-1 text-3xl font-semibold tracking-tight text-primary">
              {item.stat}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
