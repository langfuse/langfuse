import { useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Label } from "@/src/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { Switch } from "@/src/components/ui/switch";

export function ExperimentsBetaSwitch({
  enabled,
  onEnabledChange,
}: {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
}) {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const handleSwitchChange = (checked: boolean) => {
    onEnabledChange(checked);

    if (checked) {
      setIsPopoverOpen(true);
    }
  };

  return (
    <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
      <PopoverTrigger asChild>
        <div className="flex items-center gap-2 px-2 py-1">
          <Label htmlFor="experiments-beta-toggle">Experiments Beta</Label>
          <Switch
            id="experiments-beta-toggle"
            checked={enabled}
            onCheckedChange={handleSwitchChange}
          />
        </div>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="space-y-3">
          <div className="space-y-1">
            <p className="font-medium">Experiments Beta</p>
            <p className="text-muted-foreground text-sm">
              Get early-access to our new Experiments experience in Fast
              Preview. Turn it off anytime.
            </p>
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setIsPopoverOpen(false)}>
              Got it
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
