"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetcher = void 0;
const axios_1 = __importDefault(require("axios"));
const fetcher = async (args) => {
    const headers = {};
    if (args.body !== undefined && args.contentType != null) {
        headers["Content-Type"] = args.contentType;
    }
    if (args.headers != null) {
        for (const [key, value] of Object.entries(args.headers)) {
            if (value != null) {
                headers[key] = value;
            }
        }
    }
    try {
        const response = await (0, axios_1.default)({
            url: args.url,
            params: args.queryParameters,
            method: args.method,
            headers,
            data: args.body,
            validateStatus: () => true,
            transformResponse: (response) => response,
            timeout: args.timeoutMs,
            transitional: {
                clarifyTimeoutError: true,
            },
            withCredentials: args.withCredentials,
            adapter: args.adapter,
            onUploadProgress: args.onUploadProgress,
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
        });
        let body;
        if (response.data != null && response.data.length > 0) {
            try {
                body = JSON.parse(response.data) ?? undefined;
            }
            catch {
                return {
                    ok: false,
                    error: {
                        reason: "non-json",
                        statusCode: response.status,
                        rawBody: response.data,
                    },
                };
            }
        }
        if (response.status >= 200 && response.status < 300) {
            return {
                ok: true,
                body,
            };
        }
        else {
            return {
                ok: false,
                error: {
                    reason: "status-code",
                    statusCode: response.status,
                    body,
                },
            };
        }
    }
    catch (error) {
        if (error.code === "ETIMEDOUT") {
            return {
                ok: false,
                error: {
                    reason: "timeout",
                },
            };
        }
        return {
            ok: false,
            error: {
                reason: "unknown",
                errorMessage: error.message,
            },
        };
    }
};
exports.fetcher = fetcher;
