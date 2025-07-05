import React, { useState } from "react";
import { ChevronRightIcon, LinkIcon, UnlinkIcon } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/utils/tailwind";

interface CollapsibleSectionProps {
  title: string;
  syncable?: boolean;
  synced?: boolean;
  onSyncToggle?: () => void;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  syncable,
  synced,
  onSyncToggle,
  children,
  defaultOpen = true,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  
  return (
    <div className="border rounded-md bg-background">
      <div 
        className="flex items-center justify-between p-2 cursor-pointer hover:bg-accent/50 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-2">
          <ChevronRightIcon 
            className={cn("h-4 w-4 transition-transform", isOpen && "rotate-90")}
          />
          <span className="font-medium text-sm">{title}</span>
        </div>
        
        {syncable && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0"
            onClick={(e) => {
              e.stopPropagation();
              onSyncToggle?.();
            }}
            title={synced ? "Synced across columns" : "Independent per column"}
          >
            {synced ? (
              <LinkIcon className="h-3 w-3 text-primary" />
            ) : (
              <UnlinkIcon className="h-3 w-3 text-muted-foreground" />
            )}
          </Button>
        )}
      </div>
      
      {isOpen && (
        <div className="p-2 pt-0">
          {children}
        </div>
      )}
    </div>
  );
};