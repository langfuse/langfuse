interface Statistic {
  name: string;
  stat: string;
}

export default function StatsCards({ stats }: { stats: Statistic[] }) {
  return (
    <div>
      <h3 className="text-primary text-base leading-6 font-semibold">
        Model configuration
      </h3>
      <dl className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-4">
        {stats.map((item) => (
          <div
            key={item.name}
            className="bg-background overflow-hidden rounded-lg px-4 py-5 shadow-sm sm:p-6"
          >
            <dt className="text-muted-foreground truncate text-sm font-medium">
              {item.name}
            </dt>
            <dd className="text-primary mt-1 text-3xl font-semibold tracking-tight">
              {item.stat}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
