/* tslint:disable */
/* eslint-disable */

/**
 * [`super::LIMITS`] as JSON, for the control plane to show.
 */
export function limits(): string;

/**
 * `input`: `{"patterns": [...]}`, checked against [`super::LIMITS`].
 * Returns the [`super::Report`] as JSON.
 */
export function validate(input: string): string;
