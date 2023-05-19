import { useRouter } from "next/router";
import Header from "~/components/layouts/header";

import { api } from "~/utils/api";

export default function Trace() {
  const router = useRouter();
  const { traceId } = router.query;

  const trace = api.traces.byId.useQuery(traceId as string, {
    enabled: traceId !== undefined,
  });

  return (
    <>
      <Header
        title="Traces"
        breadcrumb={[
          { name: "Traces", href: "/traces" },
          { name: traceId as string },
        ]}
      />
      <pre>{JSON.stringify(trace.data)}</pre>
    </>
  );
}
