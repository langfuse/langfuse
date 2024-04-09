// import { expect, test, describe, vi } from "vitest";
// import { evalQueue } from "../api";
// import { QueueJobs, TraceUpsertEvent } from "@langfuse/shared";
// import { randomUUID } from "crypto";
// import logger from "../logger";
// import { z } from "zod";

// describe("handle redis events", () => {
//   test("handle redis job succeeding", async () => {
//     vi.mock("../eval-service", () => ({
//       createEvalJobs: async ({
//         data,
//       }: {
//         data: z.infer<typeof TraceUpsertEvent>;
//       }) => {
//         logger.error("vi mock");
//         return true;
//       },
//     }));

//     expect(evalQueue).toBeDefined();

//     const job = await evalQueue?.add(QueueJobs.TraceUpsert, {
//       payload: {
//         id: randomUUID(),
//         timestamp: new Date().toISOString(),
//         data: {
//           projectId: "project-id",
//           traceId: "trace-id",
//         },
//       },
//       name: QueueJobs.TraceUpsert as const,
//     });

//     // check that bullmq job is done
//     const jobState = await evalQueue?.getJobState(job!.id!);
//     await vi.waitFor(() => expect(jobState).toEqual("completed"), {
//       timeout: 5000,
//     });
//   }, 10_000);

//   // test("handle redis job failing", async () => {
//   //   let count = 0;

//   //   vi.mock("../eval-service", () => ({
//   //     createEvalJobs: async () => {
//   //       count++;
//   //       throw new Error("Failed to create eval jobs");
//   //     },
//   //   }));

//   //   expect(evalQueue).toBeDefined();

//   //   const job = await evalQueue?.add(
//   //     QueueJobs.TraceUpsert,
//   //     {
//   //       payload: {
//   //         id: randomUUID(),
//   //         timestamp: new Date().toISOString(),
//   //         data: {
//   //           projectId: "project-id",
//   //           traceId: "trace-id",
//   //         },
//   //       },
//   //       name: QueueJobs.TraceUpsert as const,
//   //     },
//   //     {
//   //       attempts: 3,
//   //       backoff: {
//   //         type: "exponential",
//   //         delay: 100,
//   //       },
//   //     }
//   //   );

//   //   // check that bullmq job is done
//   //   // check that bullmq job is done
//   //   const jobState = await evalQueue?.getJobState(job!.id!);
//   //   await vi.waitFor(() => expect(jobState).toEqual("failed"), {
//   //     timeout: 10000,
//   //   });

//   //   await vi.waitFor(() => expect(count).toEqual(3), {
//   //     timeout: 10000,
//   //   });
//   // }, 10000);
// });
