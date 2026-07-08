export interface IBackgroundMigration {
  validate: (
    args: Record<string, unknown>,
  ) => Promise<{ valid: boolean; invalidReason: string | undefined }>;

  run: (args: Record<string, unknown>) => Promise<void>;
  abort: () => Promise<void>;
}
