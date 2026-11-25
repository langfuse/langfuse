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
 * Caller-supplied compiled-size limits for control-plane validation.
 */
export interface Limits {
    /**
     * Maximum compiled NFA size of one rule, in bytes.
     */
    max_rule_bytes: number;
    /**
     * Maximum compiled NFA size of all of an organization's rules together, in bytes.
     */
    max_set_bytes: number;
}

/**
 * Machine-readable reason a guardrail pattern or rule set failed validation.
 */
export type ValidationErrorCode = "empty_pattern" | "matches_empty_string" | "unicode_not_allowed" | "syntax_error" | "size_limit_exceeded";

/**
 * Result of validating a pattern and matching it against sample text.
 */
export interface PreviewResult {
    valid: boolean;
    error?: ValidationError;
    matches: MatchSpan[];
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
    compiled_bytes?: number;
}

export interface ValidationError {
    code: ValidationErrorCode;
    message: string;
}


/**
 * Validates a single pattern and returns UTF-16 match spans against `text`.
 */
export function preview(pattern: string, text: string, max_rule_bytes: number): PreviewResult;

/**
 * Validates an organization's guardrail patterns against caller-supplied limits.
 */
export function validate(patterns: string[], limits: Limits): Report;
