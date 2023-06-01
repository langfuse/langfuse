"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Supplier = void 0;
exports.Supplier = {
    get: async (supplier) => {
        if (typeof supplier === "function") {
            return supplier();
        }
        else {
            return supplier;
        }
    },
};
