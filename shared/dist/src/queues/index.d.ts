import { z } from "zod";
export declare const QueueEnvelope: z.ZodObject<{
    timestamp: z.ZodString;
    id: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    timestamp: string;
}, {
    id: string;
    timestamp: string;
}>;
export declare const EvalEvent: z.ZodObject<{
    id: z.ZodString;
    timestamp: z.ZodString;
    data: z.ZodObject<{
        projectId: z.ZodString;
        traceId: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        projectId: string;
        traceId: string;
    }, {
        projectId: string;
        traceId: string;
    }>;
}, "strip", z.ZodTypeAny, {
    id: string;
    data: {
        projectId: string;
        traceId: string;
    };
    timestamp: string;
}, {
    id: string;
    data: {
        projectId: string;
        traceId: string;
    };
    timestamp: string;
}>;
export declare enum QueueName {
    Evaluation = "evaluation-queue"
}
export declare enum QueueJobs {
    Evaluation = "evaluation-job"
}
export type TQueueJobTypes = {
    [QueueName.Evaluation]: {
        payload: z.infer<typeof EvalEvent>;
        name: QueueJobs.Evaluation;
    };
};
