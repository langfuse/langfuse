import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import {
  parseJsonTableValueFace,
  useJsonTableValueFace,
} from "@/src/components/ui/jsonTableValueFace";

export function JsonTableValueFaceToggle() {
  const { face, setFace } = useJsonTableValueFace();

  return (
    <div className="h-fit px-2 py-0.5">
      <Tabs
        value={face}
        onValueChange={(value) => setFace(parseJsonTableValueFace(value))}
      >
        <Tabs.List size="sm">
          <Tabs.Trigger value="sans-sm" size="sm" label="Sans sm" />
          <Tabs.Trigger value="mono-xs" size="sm" label="Mono xs" />
        </Tabs.List>
      </Tabs>
    </div>
  );
}
