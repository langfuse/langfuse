"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JobTypes = exports.ModelUsageUnit = void 0;
var ModelUsageUnit;
(function (ModelUsageUnit) {
    ModelUsageUnit["Characters"] = "CHARACTERS";
    ModelUsageUnit["Tokens"] = "TOKENS";
    ModelUsageUnit["Seconds"] = "SECONDS";
    ModelUsageUnit["Milliseconds"] = "MILLISECONDS";
    ModelUsageUnit["Images"] = "IMAGES";
})(ModelUsageUnit || (exports.ModelUsageUnit = ModelUsageUnit = {}));
var JobTypes;
(function (JobTypes) {
    JobTypes["Evaluation"] = "evaluation";
})(JobTypes || (exports.JobTypes = JobTypes = {}));
