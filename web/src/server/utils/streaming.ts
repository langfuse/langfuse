// Helper function for streaming responses with large fields
export function streamResponse<
  T extends { input?: any; output?: any; metadata?: any },
>(res: any, data: T) {
  const { input, output, metadata, ...baseData } = data;

  res.setHeader("Content-Type", "application/json");

  // Start the response object
  res.write("{");

  // Stream all base properties first
  let first = true;
  for (const [key, value] of Object.entries(baseData)) {
    if (!first) res.write(",");
    res.write(`"${key}":${JSON.stringify(value)}`);
    first = false;
  }

  // Stream the large fields if they exist
  if (metadata !== undefined) {
    if (!first) res.write(",");
    res.write('"metadata":');
    res.write(JSON.stringify(metadata));
    first = false;
  }

  if (input !== undefined) {
    if (!first) res.write(",");
    res.write('"input":');
    res.write(JSON.stringify(input));
    first = false;
  }

  if (output !== undefined) {
    if (!first) res.write(",");
    res.write('"output":');
    res.write(JSON.stringify(output));
    first = false;
  }

  // Close the response
  res.write("}");
  res.end();
}
