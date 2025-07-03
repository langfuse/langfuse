/**
 * Replaces template variables in a URL with actual data values
 * Supports {{input}}, {{output}}, and {{metadata}} templates
 */
export function replaceUrlTemplates(
  url: string,
  data: {
    input?: unknown;
    output?: unknown;
    metadata?: unknown;
  }
): string {
  let result = url;

  // Replace {{input}}
  if (data.input !== undefined) {
    const inputValue = encodeURIComponent(JSON.stringify(data.input));
    result = result.replace(/\{\{input\}\}/g, inputValue);
  }

  // Replace {{output}}
  if (data.output !== undefined) {
    const outputValue = encodeURIComponent(JSON.stringify(data.output));
    result = result.replace(/\{\{output\}\}/g, outputValue);
  }

  // Replace {{metadata}}
  if (data.metadata !== undefined) {
    const metadataValue = encodeURIComponent(JSON.stringify(data.metadata));
    result = result.replace(/\{\{metadata\}\}/g, metadataValue);
  }

  return result;
}

/**
 * Prepare span data for iframe message
 */
export function prepareSpanDataForIframe(observation: {
  id: string;
  input?: unknown;
  output?: unknown;
  metadata?: unknown;
}) {
  return {
    span_id: observation.id,
    input: observation.input,
    output: observation.output,
    metadata: observation.metadata,
  };
}

/**
 * Message schemas for iframe communication
 */
export const IframeMessageTypes = {
  SETTINGS: "settings" as const,
  DATA: "data" as const,
  UPDATE: "update" as const,
  REQUEST_DATA: "request-data" as const,
} as const;

export type IframeSettingsMessage = {
  type: typeof IframeMessageTypes.SETTINGS;
  settings: {
    theme: "light" | "dark";
    readOnly: boolean;
  };
};

export type IframeDataMessage = {
  type: typeof IframeMessageTypes.DATA;
  data: ReturnType<typeof prepareSpanDataForIframe>;
};

export type IframeUpdateMessage = {
  type: typeof IframeMessageTypes.UPDATE;
  field: string;
  data: unknown;
};

export type IframeRequestDataMessage = {
  type: typeof IframeMessageTypes.REQUEST_DATA;
};

export type IframeMessage = 
  | IframeSettingsMessage 
  | IframeDataMessage 
  | IframeUpdateMessage
  | IframeRequestDataMessage;