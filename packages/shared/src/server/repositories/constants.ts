// Rule of thumb: If you join observations from left, use observations to trace and vice versa

// t.timestamp > observation.start_time - 2 days
export const OBSERVATIONS_TO_TRACE_INTERVAL = "INTERVAL 2 DAY";
// observation.start_time > t.timestamp - 1 hour
export const TRACE_TO_OBSERVATIONS_INTERVAL = "INTERVAL 1 HOUR";
// observation.start_time > s.timestamp - 1 hour
// t.timestamp > s.timestamp - 1 hour
export const SCORE_TO_TRACE_OBSERVATIONS_INTERVAL = "INTERVAL 1 HOUR";
