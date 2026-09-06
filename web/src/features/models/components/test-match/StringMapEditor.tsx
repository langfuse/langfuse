import { PlusCircle, Trash2 } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { useTranslations } from "next-intl";

type StringMapEditorProps = {
  title: string;
  description: string;
  entries: Array<[string, string]>;
  onChange: (entries: Array<[string, string]>) => void;
};

export function StringMapEditor({
  title,
  description,
  entries,
  onChange,
}: StringMapEditorProps) {
  const t = useTranslations("settingsEnterprise.models");
  const updateRows = (newRows: Array<[string, string]>) => {
    onChange(newRows);
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="pb-2 text-sm font-bold">
          {t("testMatch.optional", { title })}
        </div>
        <div className="text-muted-foreground text-sm">{description}</div>
      </div>

      {entries.length > 0 && (
        <div className="space-y-2 rounded-lg border p-3">
          <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-sm font-bold">
            <div>{t("common.key")}</div>
            <div>{t("common.value")}</div>
            <div className="w-10" />
          </div>
          {entries.map(([key, value], index) => (
            <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-2">
              <Input
                placeholder={t("testMatch.keyPlaceholder")}
                value={key}
                onChange={(event) => {
                  const newRows = [...entries];
                  newRows[index] = [event.target.value, value];
                  updateRows(newRows);
                }}
              />
              <Input
                placeholder={t("testMatch.valuePlaceholder")}
                value={value}
                onChange={(event) => {
                  const newRows = [...entries];
                  newRows[index] = [key, event.target.value];
                  updateRows(newRows);
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  updateRows(entries.filter((_, i) => i !== index))
                }
                aria-label={t("testMatch.removeAttribute", {
                  number: index + 1,
                })}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Button
        type="button"
        variant="ghost"
        onClick={() => updateRows([...entries, ["new_key", ""]])}
        className="w-full"
      >
        <PlusCircle className="mr-2 h-4 w-4" />
        {t("testMatch.addAttribute")}
      </Button>
    </div>
  );
}
