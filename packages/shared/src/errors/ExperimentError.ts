import { BaseError } from "./BaseError";

export class ExperimentError extends BaseError {
  constructor(
    description = "Experiment failed",
    // eslint-disable-next-line no-unused-vars
    public readonly details: {
      datasetRunItemId: string;
    },
  ) {
    super("LangfuseExperimentError", 500, description, true);
  }
}
