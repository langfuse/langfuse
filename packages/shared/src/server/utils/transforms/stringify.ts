export const stringify = (data: any, key?: string): string => {
  // For comment fields, use pretty-print formatting for better readability
  // Other fields use compact format to reduce file size
  const indent = key === "comments" ? 2 : undefined;

  return JSON.stringify(
    data,
    (k, value) =>
      typeof value === "bigint" ? Number.parseInt(value.toString()) : value,
    indent,
  );
};
