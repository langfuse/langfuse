import { Observable, from } from '../rxjsStub';

export * from './isomorphic-fetch';

/**
 * Represents an HTTP method.
 */
export enum HttpMethod {
    GET = "GET",
    HEAD = "HEAD",
    POST = "POST",
    PUT = "PUT",
    DELETE = "DELETE",
    CONNECT = "CONNECT",
    OPTIONS = "OPTIONS",
    TRACE = "TRACE",
    PATCH = "PATCH"
}

/**
 * Represents an HTTP file which will be transferred from or to a server.
 */
export type HttpFile = Blob & { readonly name: string };

export class HttpException extends Error {
    public constructor(msg: string) {
        super(msg);
    }
}

/**
 * Represents the body of an outgoing HTTP request.
 */
export type RequestBody = undefined | string | FormData | URLSearchParams;

/**
 * Represents an HTTP request context
 */
export class RequestContext {
    private headers: { [key: string]: string } = {};
    private body: RequestBody = undefined;
    private url: URL;

    /**
     * Creates the request context using a http method and request resource url
     *
     * @param url url of the requested resource
     * @param httpMethod http method
     */
    public constructor(url: string, private httpMethod: HttpMethod) {
        this.url = new URL(url);
    }

    /*
     * Returns the url set in the constructor including the query string
     *
     */
    public getUrl(): string {
        return this.url.toString().endsWith("/") ?
            this.url.toString().slice(0, -1)
            : this.url.toString();
    }

    /**
     * Replaces the url set in the constructor with this url.
     *
     */
    public setUrl(url: string) {
        this.url = new URL(url);
    }

    /**
     * Sets the body of the http request either as a string or FormData
     *
     * Note that setting a body on a HTTP GET, HEAD, DELETE, CONNECT or TRACE
     * request is discouraged.
     * https://httpwg.org/http-core/draft-ietf-httpbis-semantics-latest.html#rfc.section.7.3.1
     *
     * @param body the body of the request
     */
    public setBody(body: RequestBody) {
        this.body = body;
    }

    public getHttpMethod(): HttpMethod {
        return this.httpMethod;
    }

    public getHeaders(): { [key: string]: string } {
        return this.headers;
    }

    public getBody(): RequestBody {
        return this.body;
    }

    public setQueryParam(name: string, value: string) {
        this.url.searchParams.set(name, value);
    }

    /**
     * Sets a cookie with the name and value. NO check  for duplicate cookies is performed
     *
     */
    public addCookie(name: string, value: string): void {
        if (!this.headers["Cookie"]) {
            this.headers["Cookie"] = "";
        }
        this.headers["Cookie"] += name + "=" + value + "; ";
    }

    public setHeaderParam(key: string, value: string): void  {
        this.headers[key] = value;
    }
}

export interface ResponseBody {
    text(): Promise<string>;
    binary(): Promise<Blob>;
}

/**
 * Helper class to generate a `ResponseBody` from binary data
 */
export class SelfDecodingBody implements ResponseBody {
    constructor(private dataSource: Promise<Blob>) {}

    binary(): Promise<Blob> {
        return this.dataSource;
    }

    async text(): Promise<string> {
        const data: Blob = await this.dataSource;
        // @ts-ignore
        if (data.text) {
            // @ts-ignore
            return data.text();
        }

        return new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.addEventListener("load", () => resolve(reader.result as string));
            reader.addEventListener("error", () => reject(reader.error));
            reader.readAsText(data);
        });
    }
}

export class ResponseContext {
    public constructor(
        public httpStatusCode: number,
        public headers: { [key: string]: string },
        public body: ResponseBody
    ) {}

    /**
     * Parse header value in the form `value; param1="value1"`
     *
     * E.g. for Content-Type or Content-Disposition
     * Parameter names are converted to lower case
     * The first parameter is returned with the key `""`
     */
    public getParsedHeader(headerName: string): { [parameter: string]: string } {
        const result: { [parameter: string]: string } = {};
        if (!this.headers[headerName]) {
            return result;
        }

        const parameters = this.headers[headerName].split(";");
        for (const parameter of parameters) {
            let [key, value] = parameter.split("=", 2);
            key = key.toLowerCase().trim();
            if (value === undefined) {
                result[""] = key;
            } else {
                value = value.trim();
                if (value.startsWith('"') && value.endsWith('"')) {
                    value = value.substring(1, value.length - 1);
                }
                result[key] = value;
            }
        }
        return result;
    }

    public async getBodyAsFile(): Promise<HttpFile> {
        const data = await this.body.binary();
        const fileName = this.getParsedHeader("content-disposition")["filename"] || "";
        const contentType = this.headers["content-type"] || "";
        try {
            return new File([data], fileName, { type: contentType });
        } catch (error) {
            /** Fallback for when the File constructor is not available */
            return Object.assign(data, {
                name: fileName,
                type: contentType
            });
        }
    }

    /**
     * Use a heuristic to get a body of unknown data structure.
     * Return as string if possible, otherwise as binary.
     */
    public getBodyAsAny(): Promise<string | Blob | undefined> {
        try {
            return this.body.text();
        } catch {}

        try {
            return this.body.binary();
        } catch {}

        return Promise.resolve(undefined);
    }
}

export interface HttpLibrary {
    send(request: RequestContext): Observable<ResponseContext>;
}

export interface PromiseHttpLibrary {
    send(request: RequestContext): Promise<ResponseContext>;
}

export function wrapHttpLibrary(promiseHttpLibrary: PromiseHttpLibrary): HttpLibrary {
  return {
    send(request: RequestContext): Observable<ResponseContext> {
      return from(promiseHttpLibrary.send(request));
    }
  }
}
