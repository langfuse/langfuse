import React from "react";
import { Alert } from "@/src/app/design-system/Alert/Alert";

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
      {errorMessage && (
        <Alert variant="destructive">
          <Alert.Description>{errorMessage}</Alert.Description>
        </Alert>
      )}
    </div>
  );
};
