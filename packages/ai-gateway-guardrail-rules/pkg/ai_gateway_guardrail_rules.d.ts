/* tslint:disable */
/* eslint-disable */
/**
 * A matched span in UTF-16 code-unit offsets (JavaScript string indices).
 */
export interface MatchSpan {
    start: number;
    end: number;
}

/**
 * Machine-readable reason a guardrail pattern or rule set failed validation.
 */
export type ValidationErrorCode = "empty_pattern" | "matches_empty_string" | "unicode_not_allowed" | "unsupported_lookaround" | "unsupported_backreference" | "syntax_error" | "size_limit_exceeded";

/**
 * Result of validating a pattern and matching it against sample text.
 */
export interface PreviewResult {
    valid: boolean;
    error?: ValidationError;
    matches: MatchSpan[];
    /**
     * True when preview stopped early to stay within the per-call scan budget.
     */
    truncated: boolean;
}

export interface Report {
    ok: boolean;
    rules: RuleResult[];
    set_error?: ValidationError;
    set_bytes?: number;
}

export interface RuleResult {
    index: number;
    error?: ValidationError;
}

export interface ValidationError {
    code: ValidationErrorCode;
    message: string;
}


/**
 * Validates a single pattern and returns UTF-16 match spans against `text`.
 */
export function preview(pattern: string, text: string, max_bytes: number): PreviewResult;

/**
 * Validates guardrail patterns against a combined compiled NFA limit `max_bytes`.
 */
export function validate(patterns: string[], max_bytes: number): Report;
