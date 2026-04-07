import { useRouter } from "next/router";
import { Badge } from "@/src/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { DevProjectPreviewShell } from "@/src/features/dev/components/DevProjectPreviewShell";
import {
  DEV_PLACEHOLDER_PAGES,
  isDevPlaceholderSlug,
} from "@/src/features/dev/lib/devPages";
import {
  getDesignModePageData,
  type DesignModeSlug,
} from "@/src/features/design-mode/mockDb";

export default function DevPlaceholderPage() {
  const router = useRouter();
  const slugParam = router.query.slug;
  const slug = typeof slugParam === "string" ? slugParam : "";

  if (!slug || !isDevPlaceholderSlug(slug)) {
    return null;
  }

  const page = DEV_PLACEHOLDER_PAGES[slug];
  const data = getDesignModePageData(slug as DesignModeSlug);

  return (
    <DevProjectPreviewShell currentPath={`/dev/${slug}`} title={page.title}>
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          {data.metrics.map((metric) => (
            <Card key={metric.label}>
              <CardHeader className="pb-2">
                <CardDescription>{metric.label}</CardDescription>
                <CardTitle className="text-2xl">{metric.value}</CardTitle>
              </CardHeader>
              {metric.hint ? (
                <CardContent className="text-muted-foreground text-sm">
                  {metric.hint}
                </CardContent>
              ) : null}
            </Card>
          ))}
        </div>

        {data.sections.map((section) => (
          <Card key={section.title}>
            <CardHeader>
              <CardTitle>{section.title}</CardTitle>
              {section.description ? (
                <CardDescription>{section.description}</CardDescription>
              ) : null}
            </CardHeader>
            <CardContent className="space-y-3">
              {section.items.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-4"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">{item.title}</p>
                      {item.badge ? (
                        <Badge variant="outline-solid">{item.badge}</Badge>
                      ) : null}
                    </div>
                    {item.subtitle ? (
                      <p className="text-muted-foreground text-sm">
                        {item.subtitle}
                      </p>
                    ) : null}
                  </div>
                  {item.meta ? (
                    <p className="text-muted-foreground text-sm">{item.meta}</p>
                  ) : null}
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </DevProjectPreviewShell>
  );
}
