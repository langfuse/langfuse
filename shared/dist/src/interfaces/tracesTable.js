"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tracesTableColsWithOptions = exports.tracesTableCols = void 0;
exports.tracesTableCols = [
    { name: "⭐️", id: "bookmarked", type: "boolean", internal: "t.bookmarked" },
    { name: "id", id: "id", type: "string", internal: "t.id" },
    {
        name: "name",
        id: "name",
        type: "stringOptions",
        internal: 't."name"',
        options: [], // to be filled in at runtime
    },
    {
        name: "timestamp",
        id: "timestamp",
        type: "datetime",
        internal: 't."timestamp"',
    },
    { name: "userId", id: "userId", type: "string", internal: 't."user_id"' },
    {
        name: "metadata",
        id: "metadata",
        type: "stringObject",
        internal: 't."metadata"',
    },
    {
        name: "scores_avg",
        id: "scores_avg",
        type: "numberObject",
        internal: "scores_avg",
    },
    {
        name: "Latency (s)",
        id: "latency",
        type: "number",
        internal: "tl.latency",
    },
    {
        name: "Cost ($)",
        id: "totalCost",
        type: "number",
        internal: '"calculatedTotalCost"',
    },
    {
        name: "version",
        id: "version",
        type: "string",
        internal: 't."version"',
    },
    {
        name: "release",
        id: "release",
        type: "string",
        internal: 't."release"',
    },
    {
        name: "tags",
        type: "arrayOptions",
        internal: 't."tags"',
        options: [], // to be filled in at runtime
    },
];
function tracesTableColsWithOptions(options) {
    return exports.tracesTableCols.map((col) => {
        var _a, _b, _c;
        if (col.name === "scores_avg") {
            return Object.assign(Object.assign({}, col), { keyOptions: (_a = options === null || options === void 0 ? void 0 : options.scores_avg) !== null && _a !== void 0 ? _a : [] });
        }
        if (col.name === "name") {
            return Object.assign(Object.assign({}, col), { options: (_b = options === null || options === void 0 ? void 0 : options.name) !== null && _b !== void 0 ? _b : [] });
        }
        if (col.name === "tags") {
            return Object.assign(Object.assign({}, col), { options: (_c = options === null || options === void 0 ? void 0 : options.tags) !== null && _c !== void 0 ? _c : [] });
        }
        return col;
    });
}
exports.tracesTableColsWithOptions = tracesTableColsWithOptions;
