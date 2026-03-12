import { type Queue } from "bullmq";
import { QueueName } from "../queues";
import {
  EvalExecutionQueue,
  SecondaryEvalExecutionQueue,
} from "./evalExecutionQueue";
import { IngestionQueue, SecondaryIngestionQueue } from "./ingestionQueue";
import { LLMAsJudgeExecutionQueue } from "./llmAsJudgeExecutionQueue";
import { OtelIngestionQueue } from "./otelIngestionQueue";
import { TraceUpsertQueue } from "./traceUpsert";

type ShardedQueueResolver = {
  getInstance(params?: { shardName?: string }): Queue | null;
  getShardIndexFromShardName(shardName: string | undefined): number | null;
  getShardNames(): string[];
};

const shardedQueueResolvers: ShardedQueueResolver[] = [
  IngestionQueue,
  SecondaryIngestionQueue,
  EvalExecutionQueue,
  SecondaryEvalExecutionQueue,
  LLMAsJudgeExecutionQueue,
  OtelIngestionQueue,
  TraceUpsertQueue,
];

export const getShardedQueueByName = (queueName: string): Queue | null => {
  const resolver = shardedQueueResolvers.find(
    (candidate) => candidate.getShardIndexFromShardName(queueName) !== null,
  );

  return resolver?.getInstance({ shardName: queueName }) ?? null;
};

export const getShardedQueueNames = (): string[] =>
  Array.from(
    new Set(
      shardedQueueResolvers.flatMap((resolver) => resolver.getShardNames()),
    ),
  );

export const isShardedQueueName = (queueName: string): boolean =>
  shardedQueueResolvers.some(
    (resolver) => resolver.getShardIndexFromShardName(queueName) !== null,
  );

export const getAllQueueNames = (): string[] =>
  Array.from(new Set([...Object.values(QueueName), ...getShardedQueueNames()]));
