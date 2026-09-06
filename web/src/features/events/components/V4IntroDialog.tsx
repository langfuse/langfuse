import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogBody,
  DialogFooter,
} from "@/src/components/ui/dialog";
import { useTranslations } from "next-intl";

export function V4IntroDialog({
  open,
  onConfirm,
  onDismiss,
}: {
  open: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  const t = useTranslations("coreDetails.events.v4Intro");

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onDismiss()}>
      <DialogContent
        className="[&>div:last-child]:hidden"
        aria-label={t("title")}
      >
        <DialogBody>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/assets/v4-beta-intro.jpg"
            alt={t("imageAlt")}
            className="w-full rounded-md"
          />
          <ul className="flex flex-col gap-3">
            <li className="text-muted-foreground text-sm">
              <span className="text-foreground block font-bold">
                {t("title")}
              </span>{" "}
              {t("introduction")}
            </li>
            <li className="text-muted-foreground text-sm">
              <span className="text-foreground block font-bold">
                {t("observationsTitle")}
              </span>{" "}
              {t("observationsDescription")}{" "}
              <span className="font-bold">{t("rootFilter")}</span>
              {t("sentenceEnd")}
            </li>
            <li className="text-muted-foreground text-sm">
              <span className="text-foreground block font-bold">
                {t("savedViewsTitle")}
              </span>{" "}
              {t("savedViewsDescription")}{" "}
              <a
                href="https://langfuse.com/faq/all/explore-observations-in-v4"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary font-bold hover:underline"
              >
                {t("bestPractices")}
              </a>
            </li>
          </ul>
          <div className="mt-3 rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm dark:border-yellow-700 dark:bg-yellow-950">
            <p className="text-yellow-900 dark:text-yellow-200">
              <span className="font-bold">{t("liveTracesTitle")}</span>{" "}
              {t("liveTracesDescription")}{" "}
              <a
                href="https://langfuse.com/docs/observability/sdk/upgrade-path"
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold underline hover:no-underline"
              >
                {t("upgradeGuide")}
              </a>
            </p>
          </div>
        </DialogBody>
        <DialogFooter className="items-center sm:justify-between">
          <a
            href="https://langfuse.com/docs/v4"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary text-sm font-bold hover:underline"
          >
            {t("docs")}
          </a>
          <Button onClick={onConfirm}>{t("confirm")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
