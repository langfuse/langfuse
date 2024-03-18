"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.exportOptions = exports.exportFileFormats = void 0;
exports.exportFileFormats = ["CSV", "JSON", "OPENAI-JSONL"];
exports.exportOptions = {
    CSV: { label: "CSV", extension: "csv", fileType: "text/csv" },
    JSON: { label: "JSON", extension: "json", fileType: "application/json" },
    "OPENAI-JSONL": {
        label: "OpenAI JSONL (fine-tuning)",
        extension: "jsonl",
        fileType: "application/json",
    },
};
