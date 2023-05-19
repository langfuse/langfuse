/**
 * Returns if a specific http code is in a given code range
 * where the code range is defined as a combination of digits
 * and "X" (the letter X) with a length of 3
 *
 * @param codeRange string with length 3 consisting of digits and "X" (the letter X)
 * @param code the http status code to be checked against the code range
 */
export function isCodeInRange(codeRange: string, code: number): boolean {
    // This is how the default value is encoded in OAG
    if (codeRange === "0") {
        return true;
    }
    if (codeRange == code.toString()) {
        return true;
    } else {
        const codeString = code.toString();
        if (codeString.length != codeRange.length) {
            return false;
        }
        for (let i = 0; i < codeString.length; i++) {
            if (codeRange.charAt(i) != "X" && codeRange.charAt(i) != codeString.charAt(i)) {
                return false;
            }
        }
        return true;
    }
}

/**
* Returns if it can consume form
*
* @param consumes array
*/
export function canConsumeForm(contentTypes: string[]): boolean {
    return contentTypes.indexOf('multipart/form-data') !== -1
}
