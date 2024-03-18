"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueueJobs = exports.QueueName = exports.EvalEvent = exports.QueueEnvelope = void 0;
const zod_1 = require("zod");
exports.QueueEnvelope = zod_1.z.object({
    timestamp: zod_1.z.string().datetime({ offset: true }),
    id: zod_1.z.string(),
});
exports.EvalEvent = exports.QueueEnvelope.extend({
    data: zod_1.z.object({
        projectId: zod_1.z.string(),
        traceId: zod_1.z.string(),
    }),
});
var QueueName;
(function (QueueName) {
    QueueName["Evaluation"] = "evaluation-queue";
})(QueueName || (exports.QueueName = QueueName = {}));
var QueueJobs;
(function (QueueJobs) {
    QueueJobs["Evaluation"] = "evaluation-job";
})(QueueJobs || (exports.QueueJobs = QueueJobs = {}));
