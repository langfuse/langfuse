import {
  RichDescription as RichDescriptionContent,
  type RichDescription,
} from "@/src/components/design-system/internal/RichDescription/RichDescription";

export function FormFieldDescription({
  description,
  id,
}: {
  description: RichDescription;
  id: string;
}) {
  return (
    <p id={id} className="text-muted-foreground text-sm">
      <RichDescriptionContent description={description} />
    </p>
  );
}
