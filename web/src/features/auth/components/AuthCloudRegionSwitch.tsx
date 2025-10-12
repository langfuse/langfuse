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
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
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
            {t("auth.dataRegion.label")}
            <DataRegionInfo />
          </span>
          {isSignUpPage && env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === "US" ? (
            <p className="text-xs text-muted-foreground">
              {t("auth.dataRegion.demoProjectNote")}
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

const DataRegionInfo = () => {
  const { t } = useTranslation();

  return (
    <Dialog>
      <DialogTrigger asChild>
        <a
          href="#"
          className="ml-1 text-xs text-primary-accent hover:text-hover-primary-accent"
          title={t("auth.dataRegion.whatIsThis")}
          tabIndex={-1}
        >
          {t("auth.dataRegion.whatIsThis")}
        </a>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("auth.dataRegion.title")}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <DialogDescription className="flex flex-col gap-2">
            <p>{t("auth.dataRegion.description")}</p>
            <ul className="list-disc pl-5">
              <li>{t("auth.dataRegion.usRegion")}</li>
              <li>{t("auth.dataRegion.euRegion")}</li>
            </ul>
            <p>{t("auth.dataRegion.regionsInfo")}</p>
            <p>{t("auth.dataRegion.accountsInfo")}</p>
            <p>
              {t("auth.dataRegion.moreInfo")}{" "}
              <a
                href="https://langfuse.com/docs/data-security-privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-accent underline"
              >
                {t("auth.dataRegion.securityLink")}
              </a>
              .
            </p>
          </DialogDescription>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
};
