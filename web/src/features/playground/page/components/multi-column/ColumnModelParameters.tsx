import React from "react";

import { ModelParameters } from "@/src/components/ModelParameters";
import { usePlaygroundContext } from "./PlaygroundColumnProvider";

export const ColumnModelParameters: React.FC = () => {
  const playgroundContext = usePlaygroundContext();

  return <ModelParameters {...playgroundContext} />;
};