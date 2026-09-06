import { Terminal } from "lucide-react";

import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/src/components/ui/dropdown-menu";
import { Switch } from "@/src/components/design-system/Switch/Switch";
import { useTranslations } from "next-intl";

export type JumpToPlaygroundAction = "fresh" | "existing";

type JumpToPlaygroundMenuProps = {
  onPlaygroundAction: (action: JumpToPlaygroundAction) => void;
} & (
  | {
      source: "prompt";
    }
  | {
      source: "generation";
      includeOutput: boolean;
      onIncludeOutputChange: (includeOutput: boolean) => void;
    }
);

export function JumpToPlaygroundMenu({
  onPlaygroundAction,
  ...props
}: JumpToPlaygroundMenuProps) {
  const t = useTranslations("coreDetails.playground.jump");

  return (
    <>
      <DropdownMenuItem onSelect={() => onPlaygroundAction("fresh")}>
        <Terminal className="mr-2 h-4 w-4" />
        {t("fresh")}
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => onPlaygroundAction("existing")}>
        <Terminal className="mr-2 h-4 w-4" />
        {t("existing")}
      </DropdownMenuItem>
      {props.source === "generation" && (
        <>
          <DropdownMenuSeparator />
          <div className="flex items-center justify-between px-2 py-1.5">
            <span className="text-sm">{t("includeOutput")}</span>
            <Switch
              checked={props.includeOutput}
              onCheckedChange={props.onIncludeOutputChange}
            />
          </div>
        </>
      )}
    </>
  );
}
