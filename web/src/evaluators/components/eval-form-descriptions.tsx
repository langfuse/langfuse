import DocPopup from "@/src/app/shell/layouts/doc-popup";
import { Label } from "@/src/app/design-system/legacy-primitives/label";

export function VariableMappingDescription(p: {
  title: string;
  description: string;
  href: string;
}) {
  return (
    <div className="flex h-8 min-w-0 flex-1 items-center">
      <Label className="text-sm font-normal">{p.title}</Label>
      <DocPopup description={p.description} href={p.href} />
    </div>
  );
}
