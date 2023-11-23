import { env } from "@/src/env.mjs";
import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { Divider } from "@tremor/react";
import { usePostHog } from "posthog-js/react";

const regions = [
  {
    name: "US",
    hostname: "us.cloud.langfuse.com",
    flag: "🇺🇸",
  },
  {
    name: "EU",
    hostname: "cloud.langfuse.com",
    flag: "🇪🇺",
  },
];

export function CloudRegionSwitch() {
  const posthog = usePostHog();

  if (env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === undefined) return null;

  return (
    <div>
      <div className="flex w-full items-center justify-between">
        <div>
          <span className="text-sm font-medium leading-none">Data Region</span>
          <p className="text-xs text-gray-500">
            Regions are strictly separated.
          </p>
          {env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === "US" ? (
            <p className="text-xs text-gray-500">
              Demo only available in EU region.
            </p>
          ) : null}
        </div>
        <Tabs value={env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION}>
          <TabsList>
            {regions.map((region) => (
              <TabsTrigger
                key={region.name}
                value={region.name}
                onClick={() => {
                  posthog.capture(
                    "cloud_region_switch",
                    {
                      region: region.name,
                    },
                    {
                      send_instantly: true,
                    },
                  );
                  window.location.hostname = region.hostname;
                }}
              >
                <span className="mr-2 text-xl leading-none">{region.flag}</span>
                {region.name}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
      <Divider className="text-gray-400" />
    </div>
  );
}
