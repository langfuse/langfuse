"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.orderBy = void 0;
const zod_1 = require("zod");
exports.orderBy = zod_1.z
    .object({
    column: zod_1.z.string(),
    order: zod_1.z.enum(["ASC", "DESC"]),
})
    .nullable();
