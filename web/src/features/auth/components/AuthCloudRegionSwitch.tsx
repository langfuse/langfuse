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
  DialogBody,
  DialogContent,
  DialogDescription,
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
      : env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === "HIPAA"
        ? [
            {
              name: "HIPAA",
              hostname: "hipaa.cloud.langfuse.com",
              flag: "⚕️",
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
    <div className="-mb-10 mt-8 rounded-lg bg-card px-6 py-6 text-sm sm:mx-auto sm:w-full sm:max-w-[480px] sm:rounded-lg sm:px-10">
      <div className="flex w-full flex-col gap-2">
        <div>
          <span className="text-sm font-medium leading-none">
            Data Region
            <DataRegionInfo />
          </span>
          {isSignUpPage && env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === "US" ? (
            <p className="text-xs text-muted-foreground">
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
        className="ml-1 text-xs text-primary-accent hover:text-hover-primary-accent"
        title="What is this?"
        tabIndex={-1}
      >
        (what is this?)
      </a>
    </DialogTrigger>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Data Regions</DialogTitle>
      </DialogHeader>
      <DialogBody>
        <DialogDescription className="flex flex-col gap-2">
          <p>Langfuse Cloud is available in two data regions:</p>
          <ul className="list-disc pl-5">
            <li>US: Oregon (AWS us-west-2)</li>
            <li>EU: Ireland (AWS eu-west-1)</li>
          </ul>
          <p>
            Regions are strictly separated, and no data is shared across
            regions. Choosing a region close to you can help improve speed and
            comply with local data residency laws and privacy regulations.
            Contact us to onboard into a HIPAA compliant region.
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
              className="text-primary-accent underline"
            >
              langfuse.com/security
            </a>
            .
          </p>
        </DialogDescription>
      </DialogBody>
    </DialogContent>
  </Dialog>
);
