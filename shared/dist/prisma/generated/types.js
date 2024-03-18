"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatasetStatus = exports.TokenType = exports.PricingUnit = exports.ScoreSource = exports.ObservationLevel = exports.ObservationType = exports.MembershipRole = void 0;
exports.MembershipRole = {
    OWNER: "OWNER",
    ADMIN: "ADMIN",
    MEMBER: "MEMBER",
    VIEWER: "VIEWER"
};
exports.ObservationType = {
    SPAN: "SPAN",
    EVENT: "EVENT",
    GENERATION: "GENERATION"
};
exports.ObservationLevel = {
    DEBUG: "DEBUG",
    DEFAULT: "DEFAULT",
    WARNING: "WARNING",
    ERROR: "ERROR"
};
exports.ScoreSource = {
    API: "API",
    REVIEW: "REVIEW"
};
exports.PricingUnit = {
    PER_1000_TOKENS: "PER_1000_TOKENS",
    PER_1000_CHARS: "PER_1000_CHARS"
};
exports.TokenType = {
    PROMPT: "PROMPT",
    COMPLETION: "COMPLETION",
    TOTAL: "TOTAL"
};
exports.DatasetStatus = {
    ACTIVE: "ACTIVE",
    ARCHIVED: "ARCHIVED"
};
