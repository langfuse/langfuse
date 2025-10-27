import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { type ObjectType } from "@/src/features/scores/lib/analytics-url-state";

const OBJECT_TYPE_OPTIONS: Array<{ value: ObjectType; label: string }> = [
  { value: "all", label: "All" },
  { value: "trace", label: "Trace" },
  { value: "session", label: "Session" },
  { value: "observation", label: "Observation" },
  { value: "run", label: "Run" },
];

interface ObjectTypeFilterProps {
  value: ObjectType;
  onChange: (value: ObjectType) => void;
}

export function ObjectTypeFilter({ value, onChange }: ObjectTypeFilterProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium">Object Type:</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="Select type" />
        </SelectTrigger>
        <SelectContent>
          {OBJECT_TYPE_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
