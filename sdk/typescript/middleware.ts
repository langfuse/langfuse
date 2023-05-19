import {RequestContext, ResponseContext} from './http/http';
import { Observable, from } from './rxjsStub';

/**
 * Defines the contract for a middleware intercepting requests before
 * they are sent (but after the RequestContext was created)
 * and before the ResponseContext is unwrapped.
 *
 */
export interface Middleware {
    /**
     * Modifies the request before the request is sent.
     *
     * @param context RequestContext of a request which is about to be sent to the server
     * @returns an observable of the updated request context
     *
     */
    pre(context: RequestContext): Observable<RequestContext>;
    /**
     * Modifies the returned response before it is deserialized.
     *
     * @param context ResponseContext of a sent request
     * @returns an observable of the modified response context
     */
    post(context: ResponseContext): Observable<ResponseContext>;
}

export class PromiseMiddlewareWrapper implements Middleware {

    public constructor(private middleware: PromiseMiddleware) {

    }

    pre(context: RequestContext): Observable<RequestContext> {
        return from(this.middleware.pre(context));
    }

    post(context: ResponseContext): Observable<ResponseContext> {
        return from(this.middleware.post(context));
    }

}

/**
 * Defines the contract for a middleware intercepting requests before
 * they are sent (but after the RequestContext was created)
 * and before the ResponseContext is unwrapped.
 *
 */
export interface PromiseMiddleware {
    /**
     * Modifies the request before the request is sent.
     *
     * @param context RequestContext of a request which is about to be sent to the server
     * @returns an observable of the updated request context
     *
     */
    pre(context: RequestContext): Promise<RequestContext>;
        /**
     * Modifies the returned response before it is deserialized.
     *
     * @param context ResponseContext of a sent request
     * @returns an observable of the modified response context
     */
    post(context: ResponseContext): Promise<ResponseContext>;
}
