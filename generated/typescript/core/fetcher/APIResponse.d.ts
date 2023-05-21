export declare type APIResponse<Success, Failure> = SuccessfulResponse<Success> | FailedResponse<Failure>;
export interface SuccessfulResponse<T> {
    ok: true;
    body: T;
}
export interface FailedResponse<T> {
    ok: false;
    error: T;
}
