import React from "react";
import { Banner } from "@/src/components/design-system/Banner/Banner";

export interface StepHeaderProps {
  title: string;
  description: string;
  errorMessage?: string;
}

export const StepHeader: React.FC<StepHeaderProps> = ({
  title,
  description,
  errorMessage,
}) => {
  return (
    <div className="space-y-2">
      <h3 className="text-lg font-bold">{title}</h3>
      <p className="text-muted-foreground text-sm">{description}</p>
      {errorMessage && <Banner variant="error">{errorMessage}</Banner>}
    </div>
  );
};
