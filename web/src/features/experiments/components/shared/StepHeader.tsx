import React from "react";

export interface StepHeaderProps {
  title: string;
  description: string;
}

export const StepHeader: React.FC<StepHeaderProps> = ({
  title,
  description,
}) => {
  return (
    <div className="space-y-2">
      <h3 className="text-lg font-medium">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
};
