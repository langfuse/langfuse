import { InvalidRequestError } from "../../errors/InvalidRequestError";

/** A customer query that does not lex, parse or translate. Maps to HTTP 400. */
export class CustomerSqlError extends InvalidRequestError {}
