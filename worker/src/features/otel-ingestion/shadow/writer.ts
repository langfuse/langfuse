import type { ClickhouseClientType } from "@langfuse/shared/src/server";
import { ClickhouseWriter } from "../../../services/ClickhouseWriter";
import { nativeWriteStrategyFactory } from "../../../services/ClickhouseWriter/writeStrategies";

let writer: ReturnType<typeof ClickhouseWriter.createNativeWriter> | undefined;

export function getShadowWriter(client?: ClickhouseClientType) {
  if (writer) return writer;
  writer = ClickhouseWriter.createNativeWriter(client, {
    ...nativeWriteStrategyFactory,
    format: "native-test",
    destinationTable: "events_native_test",
  });
  return writer;
}

export async function closeShadowWriter() {
  await writer?.shutdown();
  writer = undefined;
}
