import { Configuration } from '../configuration'

/**
 *
 * @export
 */
export const COLLECTION_FORMATS = {
    csv: ",",
    ssv: " ",
    tsv: "\t",
    pipes: "|",
};


/**
 *
 * @export
 * @class BaseAPI
 */
export class BaseAPIRequestFactory {

    constructor(protected configuration: Configuration) {
    }
};

/**
 *
 * @export
 * @class RequiredError
 * @extends {Error}
 */
export class RequiredError extends Error {
    name: "RequiredError" = "RequiredError";
    constructor(public api: string, public method: string, public field: string) {
        super("Required parameter " + field + " was null or undefined when calling " + api + "." + method + ".");
    }
}
