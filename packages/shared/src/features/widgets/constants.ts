/**
 * Maximum number of dimensions supported by pivot table widget
 * This constant controls the complexity of pivot tables and can be easily
 * increased in the future to support more nested dimensions.
 *
 * Current limit: 2 dimensions
 * - Keeps UI manageable and performance optimal
 * - Supports most common use cases (group by 1-2 fields)
 * - Can be increased to 3+ when needed
 */
export const MAX_PIVOT_TABLE_DIMENSIONS = 2;
