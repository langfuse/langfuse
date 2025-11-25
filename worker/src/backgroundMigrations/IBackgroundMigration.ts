export interface IBackgroundMigration {
  validate: (
    // eslint-disable-next-line no-unused-vars
    args: Record<string, unknown>,
  ) => Promise<{ valid: boolean; invalidReason: string | undefined }>;
  // eslint-disable-next-line no-unused-vars
  run: (args: Record<string, unknown>) => Promise<void>;
  abort: () => Promise<void>;
}
