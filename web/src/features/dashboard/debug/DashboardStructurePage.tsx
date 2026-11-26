import Link from "next/link";
import { useRouter } from "next/router";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import Page from "@/src/components/layouts/Page";
import { Codeblock } from "@/src/components/design-system/Codeblock/Codeblock";

export type DashboardStructureProps = {
  projectId: string;
  dashboards: { id: string; name: string }[];
  widgets: { id: string; name: string }[];
  dashboardCount: number;
  widgetCount: number;
  dashboardId: string | null;
  widgetId: string | null;
  dashboardJson: string | null;
  widgetJson: string | null;
  placedWidgetIds: string[];
};

export default function DashboardStructurePage(props: DashboardStructureProps) {
  const router = useRouter();
  const base = `/project/${props.projectId}`;
  const select = (key: "dashboardId" | "widgetId", value: string) =>
    router.push({
      pathname: `${base}/dashboards/debug`,
      query: { ...router.query, [key]: value },
    });

  return (
    <Page headerProps={{ title: "Dashboard structure" }} scrollable withPadding>
      <div className="ph-no-capture flex min-w-0 flex-col gap-6 p-4">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <Link className="underline" href={`${base}/dashboards`}>
            Dashboards
          </Link>
          <Link className="underline" href={`${base}/widgets`}>
            Widgets
          </Link>
          <button
            className="underline"
            onClick={() => router.replace(router.asPath)}
          >
            Refresh stored data
          </button>
        </div>
        <p className="text-muted-foreground text-sm">
          Local development inspector. These are persisted database values.
          Dashboard placements reference saved widgets by ID.
          {props.dashboardCount > props.dashboards.length ||
          props.widgetCount > props.widgets.length
            ? " Each selector shows the first 500 records. Open a specific record with dashboardId or widgetId in the URL."
            : ""}
        </p>
        <div className="grid min-w-0 gap-8 xl:grid-cols-2">
          <section className="flex min-w-0 flex-col gap-4">
            <label className="flex flex-col gap-2 text-sm font-medium">
              Dashboard ({props.dashboardCount})
              <SelectInput
                aria-label="Dashboard"
                value={props.dashboardId ?? ""}
                placeholder="Select a dashboard"
                search={{ placeholder: "Search dashboards" }}
                options={props.dashboards.map((item) => ({
                  value: item.id,
                  label: `${item.name} · ${item.id}`,
                }))}
                onValueChange={(value) => select("dashboardId", value)}
              />
            </label>
            {props.dashboardId && (
              <Link
                className="text-sm underline"
                href={`${base}/dashboards/${props.dashboardId}`}
              >
                Open dashboard
              </Link>
            )}
            {props.placedWidgetIds.length > 0 && (
              <div className="flex flex-wrap gap-2 text-sm">
                <span>Referenced widgets</span>
                {props.placedWidgetIds.map((id) => (
                  <button
                    key={id}
                    className="font-mono underline"
                    onClick={() => select("widgetId", id)}
                  >
                    {id}
                  </button>
                ))}
              </div>
            )}
            {props.dashboardJson ? (
              <Codeblock value={props.dashboardJson} language="json" />
            ) : (
              <p className="text-muted-foreground text-sm">
                Select a dashboard to inspect its stored layout.
              </p>
            )}
          </section>
          <section className="flex min-w-0 flex-col gap-4">
            <label className="flex flex-col gap-2 text-sm font-medium">
              Widget ({props.widgetCount})
              <SelectInput
                aria-label="Widget"
                value={props.widgetId ?? ""}
                placeholder="Select a widget"
                search={{ placeholder: "Search widgets" }}
                options={props.widgets.map((item) => ({
                  value: item.id,
                  label: `${item.name} · ${item.id}`,
                }))}
                onValueChange={(value) => select("widgetId", value)}
              />
            </label>
            {props.widgetId && (
              <Link
                className="text-sm underline"
                href={`${base}/widgets/${props.widgetId}`}
              >
                Open widget
              </Link>
            )}
            {props.widgetJson ? (
              <Codeblock value={props.widgetJson} language="json" />
            ) : (
              <p className="text-muted-foreground text-sm">
                Select a widget to inspect its stored configuration.
              </p>
            )}
          </section>
        </div>
      </div>
    </Page>
  );
}
