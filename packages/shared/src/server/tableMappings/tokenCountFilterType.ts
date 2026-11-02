// usage_details is Map(String, UInt64). Comparing those counts with
// Decimal64(3) scales each stored value into Int64 and throws
// DECIMAL_OVERFLOW above ~9.2e15, which fails the whole query. Float64
// covers that range and still accepts fractional filter values.
export const tokenCountFilterClickhouseType = "Float64";
