import { env } from "@/src/env.mjs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/src/components/ui/dialog";

const regions =
  env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === "STAGING"
    ? [
        {
          name: "STAGING",
          hostname: "staging.langfuse.com",
          flag: "🇪🇺",
        },
      ]
    : env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === "DEV"
      ? [
          {
            name: "DEV",
            hostname: null,
            flag: "🚧",
          },
        ]
      : [
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

export function CloudRegionSwitch({
  isSignUpPage,
}: {
  isSignUpPage?: boolean;
}) {
  const capture = usePostHogClientCapture();

  if (env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === undefined) return null;

  const currentRegion = regions.find(
    (region) => region.name === env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
  );

  return (
    <div>
      <div className="mb-6 flex w-full flex-col gap-3">
        <div>
          <span className="text-sm font-medium leading-none">
            Data Region
            <DataRegionInfo />
          </span>
          {isSignUpPage && env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === "US" ? (
            <p className="text-xs text-gray-500">
              Demo project is only available in the EU region.
            </p>
          ) : null}
        </div>
        <Select
          value={currentRegion?.name}
          onValueChange={(value) => {
            const region = regions.find((region) => region.name === value);
            if (!region) return;
            capture(
              "sign_in:cloud_region_switch",
              {
                region: region.name,
              },
              {
                send_instantly: true,
              },
            );
            if (region.hostname) {
              window.location.hostname = region.hostname;
            }
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {regions.map((region) => (
              <SelectItem key={region.name} value={region.name}>
                <span className="mr-2 text-xl leading-none">{region.flag}</span>
                {region.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

const DataRegionInfo = () => (
  <Dialog>
    <DialogTrigger asChild>
      <a
        href="#"
        className="ml-1 text-xs text-indigo-600 hover:text-indigo-500"
        title="What is this?"
      >
        (what is this?)
      </a>
    </DialogTrigger>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Data Regions</DialogTitle>
      </DialogHeader>
      <div className="flex flex-col gap-2">
        <p>Langfuse Cloud is available in two data regions:</p>
        <ul className="list-disc pl-5">
          <li>US: Northern California (us-west-1)</li>
          <li>EU: Frankfurt, Germany (eu-central-1)</li>
        </ul>
        <p>
          Regions are strictly separated, and no data is shared across regions.
          Choosing a region close to you can help improve speed and comply with
          local data residency laws and privacy regulations.
        </p>
        <p>
          You can have accounts in both regions and data migrations are
          available on Team plans.
        </p>
        <p>
          For more information, visit{" "}
          <a
            href="https://langfuse.com/docs/data-security-privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 underline"
          >
            langfuse.com/security
          </a>
          .
        </p>
      </div>
    </DialogContent>
  </Dialog>
);
