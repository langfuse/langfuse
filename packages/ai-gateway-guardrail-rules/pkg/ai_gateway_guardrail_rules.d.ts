/* tslint:disable */
/* eslint-disable */
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

export interface Report {
    ok: boolean;
    rules: RuleResult[];
    set_error?: string;
    set_bytes?: number;
}

export interface RuleResult {
    index: number;
    error?: string;
    compiled_bytes?: number;
}


/**
 * Validates an organization's guardrail patterns against caller-supplied limits.
 */
export function validate(patterns: string[], limits: Limits): Report;
