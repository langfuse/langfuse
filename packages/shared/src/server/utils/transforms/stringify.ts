export const stringify = (data: any): string => {
  // Use pretty-print formatting for all nested objects for better readability in CSV exports
  const indent = 2;

  return JSON.stringify(
    data,
    (k, value) =>
      typeof value === "bigint" ? Number.parseInt(value.toString()) : value,
    indent,
  );
};
