type ConnectionOption = {
  value: string;
  displayValue: string;
};

export function getGatewayModelConnectionSearchOptions(
  connectionOptions: ConnectionOption[],
  retainedConnectionIds: string[],
) {
  const nameCounts = new Map<string, number>();
  for (const { displayValue } of connectionOptions) {
    nameCounts.set(displayValue, (nameCounts.get(displayValue) ?? 0) + 1);
  }

  const labeledOptions = connectionOptions.map(({ value, displayValue }) => ({
    value,
    displayValue:
      nameCounts.get(displayValue) === 1
        ? displayValue
        : `${displayValue} (${value})`,
  }));
  const availableIds = new Set(connectionOptions.map(({ value }) => value));
  const fallbackOptions = retainedConnectionIds
    .filter((value) => !availableIds.has(value))
    .map((value) => ({ value, displayValue: value }));
  const registryOptions = [
    ...connectionOptions.map(({ value }) => ({ value, displayValue: value })),
    ...labeledOptions,
    ...fallbackOptions,
  ];

  return {
    registryOptions,
    observedValues: labeledOptions.map(({ displayValue }) => displayValue),
    connectionIdByDisplayValue: new Map(
      registryOptions.map(({ value, displayValue }) => [displayValue, value]),
    ),
  };
}
