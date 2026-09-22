// PROTOTYPE — throwaway. Key-expiry picker shared by the create-form variants.

import { Input } from "@/src/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { type ExpiryKey, expiryOptions } from "./permissionCatalog";

export const ExpirySelect = ({
  expiry,
  customExpiry,
  onChange,
}: {
  expiry: ExpiryKey;
  customExpiry: string;
  onChange: (next: { expiry: ExpiryKey; customExpiry: string }) => void;
}) => (
  <div className="flex flex-col gap-2">
    <div className={expiry === "custom" ? "grid grid-cols-2 gap-2" : ""}>
      <Select
        value={expiry}
        onValueChange={(v) =>
          onChange({ expiry: v as ExpiryKey, customExpiry })
        }
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {expiryOptions.map((o) => (
            <SelectItem key={o.key} value={o.key}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {expiry === "custom" && (
        <Input
          type="date"
          min={new Date().toISOString().slice(0, 10)}
          className="[&::-webkit-calendar-picker-indicator]:order-first [&::-webkit-calendar-picker-indicator]:mr-2"
          value={customExpiry}
          onChange={(e) => onChange({ expiry, customExpiry: e.target.value })}
        />
      )}
    </div>
  </div>
);
