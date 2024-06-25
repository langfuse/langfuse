export const stringify = (data: any): string => {
  return JSON.stringify(data, (key, value) =>
    typeof value === "bigint" ? Number.parseInt(value.toString()) : value
  );
};
