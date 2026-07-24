package query

import (
	"strings"

	"github.com/langfuse/langfuse/go/observations-api/internal/apierror"
)

// Constructors for the exact zod v4 issue objects the Node implementation
// emits (captured from live responses; see the differential test suite).

func pathOf(segments ...any) []any {
	if segments == nil {
		return []any{}
	}
	return segments
}

func issueTooBig(maximum float64, path ...any) apierror.ZodIssue {
	return apierror.ZodIssue{
		"origin": "number", "code": "too_big", "maximum": maximum, "inclusive": true,
		"path": pathOf(path...), "message": "Too big: expected number to be <=1000",
	}
}

func issueTooSmall(minimum float64, path ...any) apierror.ZodIssue {
	return apierror.ZodIssue{
		"origin": "number", "code": "too_small", "minimum": minimum, "inclusive": true,
		"path": pathOf(path...), "message": "Too small: expected number to be >=0",
	}
}

func issueNaN(path ...any) apierror.ZodIssue {
	return apierror.ZodIssue{
		"expected": "number", "code": "invalid_type", "received": "NaN",
		"path": pathOf(path...), "message": "Invalid input: expected number, received NaN",
	}
}

func issueInvalidType(expected, received string, path ...any) apierror.ZodIssue {
	message := "Invalid input: expected " + expected
	if received != "" {
		message += ", received " + received
	}
	// zod v4 only carries a `received` field for the special values NaN and
	// Invalid Date; ordinary type mismatches mention it in the message only.
	return apierror.ZodIssue{
		"expected": expected, "code": "invalid_type",
		"path": pathOf(path...), "message": message,
	}
}

func issueInvalidDate(path ...any) apierror.ZodIssue {
	return apierror.ZodIssue{
		"expected": "date", "code": "invalid_type", "received": "Invalid Date",
		"path": pathOf(path...), "message": "Invalid input: expected date, received Date",
	}
}

func issueEnum(values []string, path ...any) apierror.ZodIssue {
	quoted := make([]string, len(values))
	for i, v := range values {
		quoted[i] = `"` + v + `"`
	}
	vals := make([]any, len(values))
	for i, v := range values {
		vals[i] = v
	}
	return apierror.ZodIssue{
		"code": "invalid_value", "values": vals,
		"path":    pathOf(path...),
		"message": "Invalid option: expected one of " + strings.Join(quoted, "|"),
	}
}

// zodDatetimePattern is the exact pattern zod v4 reports for
// z.iso.datetime({ offset: true }) failures (calendar-aware, uppercase Z or
// ±hh:mm offsets, optional seconds and fraction).
const zodDatetimePattern = `/^(?:(?:\d\d[2468][048]|\d\d[13579][26]|\d\d0[48]|[02468][048]00|[13579][26]00)-02-29|\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\d|30)|(?:02)-(?:0[1-9]|1\d|2[0-8])))T(?:(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|([+-](?:[01]\d|2[0-3]):[0-5]\d)))$/`

func issueInvalidDatetimeFormat(path ...any) apierror.ZodIssue {
	return apierror.ZodIssue{
		"origin": "string", "code": "invalid_format", "format": "datetime",
		"pattern": zodDatetimePattern,
		"path":    pathOf(path...), "message": "Invalid ISO datetime",
	}
}

func issueCustom(message string, path ...any) apierror.ZodIssue {
	return apierror.ZodIssue{
		"code": "custom", "path": pathOf(path...), "message": message,
	}
}

// issueUnionOfLiterals models z.union([z.literal(a), z.literal(b), ...])
// failures: an invalid_union whose nested errors carry one invalid_value per
// branch (parseIoAsJson, string-filter operators).
func issueUnionOfLiterals(branches [][]string, path ...any) apierror.ZodIssue {
	nested := make([]any, 0, len(branches))
	for _, values := range branches {
		var message string
		if len(values) == 1 {
			message = `Invalid input: expected "` + values[0] + `"`
		} else {
			quoted := make([]string, len(values))
			for i, v := range values {
				quoted[i] = `"` + v + `"`
			}
			message = "Invalid option: expected one of " + strings.Join(quoted, "|")
		}
		vals := make([]any, len(values))
		for i, v := range values {
			vals[i] = v
		}
		nested = append(nested, []any{apierror.ZodIssue{
			"code": "invalid_value", "values": vals, "path": []any{}, "message": message,
		}})
	}
	return apierror.ZodIssue{
		"code": "invalid_union", "errors": nested,
		"path": pathOf(path...), "message": "Invalid input",
	}
}

// issueNoDiscriminator models discriminated-union failures on the filter
// `type` field.
func issueNoDiscriminator(path ...any) apierror.ZodIssue {
	return apierror.ZodIssue{
		"code": "invalid_union", "errors": []any{},
		"note": "No matching discriminator", "discriminator": "type",
		"path": pathOf(path...), "message": "Invalid input",
	}
}
