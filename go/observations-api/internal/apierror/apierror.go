// Package apierror defines the error types of the public-api error contract
// (mirroring the shared BaseError hierarchy and zod validation errors).
package apierror

// APIError is the equivalent of the shared BaseError hierarchy: an error that
// carries an HTTP status code and an error-class name for the wire contract.
type APIError struct {
	Status  int
	Name    string
	Message string
}

func (e *APIError) Error() string { return e.Message }

func NewInvalidRequestError(message string) *APIError {
	return &APIError{Status: 400, Name: "InvalidRequestError", Message: message}
}

func NewNotFoundError(message string) *APIError {
	return &APIError{Status: 404, Name: "LangfuseNotFoundError", Message: message}
}

func NewMethodNotAllowedError() *APIError {
	return &APIError{Status: 405, Name: "MethodNotAllowedError", Message: "Method not allowed"}
}

func NewInternalServerError(message string) *APIError {
	return &APIError{Status: 500, Name: "InternalServerError", Message: message}
}

// ZodIssue mirrors the zod issue objects Node returns for query validation
// failures. Shapes vary by issue code (too_big carries maximum/inclusive,
// invalid_value carries values, ...), so it is a free-form object replicated
// field-for-field from the zod v4 output.
type ZodIssue map[string]any

// ValidationError renders as {"message": "Invalid request data", "error": [issues]}.
type ValidationError struct {
	Issues []ZodIssue
}

func (e *ValidationError) Error() string { return "Invalid request data" }
