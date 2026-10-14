/** The exact, case-insensitive Postgres pattern for one model name. */
export const matchPatternFor = (modelName: string) => `(?i)^(${modelName})$`;
