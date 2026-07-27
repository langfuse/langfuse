import DocPopup from "@/src/components/layouts/doc-popup";
import { Label } from "@/src/components/ui/label";

export function VariableMappingDescription(p: {
  title: string;
  description: string;
  href: string;
}) {
  return (
    <div className="flex w-1/2 items-center">
      <Label className="text-sm font-normal">{p.title}</Label>
      <DocPopup description={p.description} href={p.href} />
    </div>
  );
}
