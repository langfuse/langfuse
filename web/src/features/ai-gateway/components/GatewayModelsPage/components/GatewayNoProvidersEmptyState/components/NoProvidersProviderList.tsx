import { type ReactNode, useId } from "react";

type NoProvidersProviderListProps = {
  children: ReactNode;
};

export function NoProvidersProviderList({
  children,
}: NoProvidersProviderListProps) {
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <h3 id={headingId} className="text-lg font-bold">
        Connections
      </h3>
      <ul className="grid grid-cols-1 gap-3 @2xl:grid-cols-2 @5xl:grid-cols-3">
        {children}
      </ul>
    </section>
  );
}
