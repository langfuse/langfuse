import { eventTypes, IngestionEventType } from "./types";

const reservedCharsEscapeMap = [
  { reserved: ":", escape: "|%|" },
  { reserved: "_", escape: "|#|" },
];

export enum ClickhouseEntityType {
  Trace = "trace",
  Score = "score",
  Observation = "observation",
  SDK_LOG = "sdk-log",
}

export class IngestionUtils {
  public static getBufferKey(flushKey: string): string {
    const { projectId, eventType, entityId } =
      IngestionUtils.parseFlushKey(flushKey);

    const sanitizedEntityId = IngestionUtils.escapeReservedChars(entityId);

    return (
      "ingestionBuffer:" + `${projectId}_${eventType}_${sanitizedEntityId}`
    );
  }

  public static getFlushKey(params: {
    projectId: string;
    eventType: ClickhouseEntityType;
    entityId: string;
    batchTimestamp: string;
  }): string {
    const { projectId, eventType, entityId, batchTimestamp } = params;
    const sanitizedEntityId = IngestionUtils.escapeReservedChars(entityId);

    return `${projectId}_${eventType}_${sanitizedEntityId}_${batchTimestamp}`;
  }

  public static parseFlushKey(projectEntityKey: string) {
    const split = projectEntityKey.split("_");

    if (split.length < 3) {
      throw new Error(
        `Invalid project entity key format ${projectEntityKey}, expected 3 or 4 parts`
      );
    }

    const [projectId, eventType, escapedEntityId, batchTimestamp] = split;
    const entityId = IngestionUtils.unescapeReservedChars(escapedEntityId);

    return { projectId, eventType, entityId, batchTimestamp };
  }

  private static escapeReservedChars(string: string): string {
    return reservedCharsEscapeMap.reduce(
      (acc, { reserved, escape }) => acc.replaceAll(reserved, escape),
      string
    );
  }

  private static unescapeReservedChars(escapedString: string): string {
    return reservedCharsEscapeMap.reduce(
      (acc, { reserved, escape }) => acc.replaceAll(escape, reserved),
      escapedString
    );
  }

  public static getEventType(event: IngestionEventType): ClickhouseEntityType {
    switch (event.type) {
      case eventTypes.TRACE_CREATE:
        return ClickhouseEntityType.Trace;
      case eventTypes.OBSERVATION_CREATE:
      case eventTypes.OBSERVATION_UPDATE:
      case eventTypes.EVENT_CREATE:
      case eventTypes.SPAN_CREATE:
      case eventTypes.SPAN_UPDATE:
      case eventTypes.GENERATION_CREATE:
      case eventTypes.GENERATION_UPDATE:
        return ClickhouseEntityType.Observation;
      case eventTypes.SCORE_CREATE:
        return ClickhouseEntityType.Score;
      case eventTypes.SDK_LOG:
        return ClickhouseEntityType.SDK_LOG;
    }
  }
}
