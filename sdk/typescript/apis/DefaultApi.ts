// TODO: better import syntax?
import {BaseAPIRequestFactory, RequiredError, COLLECTION_FORMATS} from './baseapi';
import {Configuration} from '../configuration';
import {RequestContext, HttpMethod, ResponseContext, HttpFile} from '../http/http';
import {ObjectSerializer} from '../models/ObjectSerializer';
import {ApiException} from './exception';
import {canConsumeForm, isCodeInRange} from '../util';
import {SecurityAuthentication} from '../auth/auth';


import { ApiObservationsPost201Response } from '../models/ApiObservationsPost201Response';
import { ApiObservationsPost400Response } from '../models/ApiObservationsPost400Response';
import { ApiObservationsPostRequest } from '../models/ApiObservationsPostRequest';

/**
 * no description
 */
export class DefaultApiRequestFactory extends BaseAPIRequestFactory {

    /**
     * Creates a new observation
     * @param apiObservationsPostRequest 
     */
    public async apiObservationsPost(apiObservationsPostRequest: ApiObservationsPostRequest, _options?: Configuration): Promise<RequestContext> {
        let _config = _options || this.configuration;

        // verify required parameter 'apiObservationsPostRequest' is not null or undefined
        if (apiObservationsPostRequest === null || apiObservationsPostRequest === undefined) {
            throw new RequiredError("DefaultApi", "apiObservationsPost", "apiObservationsPostRequest");
        }


        // Path Params
        const localVarPath = '/api/observations';

        // Make Request Context
        const requestContext = _config.baseServer.makeRequestContext(localVarPath, HttpMethod.POST);
        requestContext.setHeaderParam("Accept", "application/json, */*;q=0.8")


        // Body Params
        const contentType = ObjectSerializer.getPreferredMediaType([
            "application/json"
        ]);
        requestContext.setHeaderParam("Content-Type", contentType);
        const serializedBody = ObjectSerializer.stringify(
            ObjectSerializer.serialize(apiObservationsPostRequest, "ApiObservationsPostRequest", ""),
            contentType
        );
        requestContext.setBody(serializedBody);

        
        const defaultAuth: SecurityAuthentication | undefined = _options?.authMethods?.default || this.configuration?.authMethods?.default
        if (defaultAuth?.applySecurityAuthentication) {
            await defaultAuth?.applySecurityAuthentication(requestContext);
        }

        return requestContext;
    }

}

export class DefaultApiResponseProcessor {

    /**
     * Unwraps the actual response sent by the server from the response context and deserializes the response content
     * to the expected objects
     *
     * @params response Response returned by the server for a request to apiObservationsPost
     * @throws ApiException if the response code was not in [200, 299]
     */
     public async apiObservationsPost(response: ResponseContext): Promise<ApiObservationsPost201Response > {
        const contentType = ObjectSerializer.normalizeMediaType(response.headers["content-type"]);
        if (isCodeInRange("201", response.httpStatusCode)) {
            const body: ApiObservationsPost201Response = ObjectSerializer.deserialize(
                ObjectSerializer.parse(await response.body.text(), contentType),
                "ApiObservationsPost201Response", ""
            ) as ApiObservationsPost201Response;
            return body;
        }
        if (isCodeInRange("400", response.httpStatusCode)) {
            const body: ApiObservationsPost400Response = ObjectSerializer.deserialize(
                ObjectSerializer.parse(await response.body.text(), contentType),
                "ApiObservationsPost400Response", ""
            ) as ApiObservationsPost400Response;
            throw new ApiException<ApiObservationsPost400Response>(response.httpStatusCode, "Invalid request data", body, response.headers);
        }
        if (isCodeInRange("405", response.httpStatusCode)) {
            throw new ApiException<undefined>(response.httpStatusCode, "Method not allowed", undefined, response.headers);
        }

        // Work around for missing responses in specification, e.g. for petstore.yaml
        if (response.httpStatusCode >= 200 && response.httpStatusCode <= 299) {
            const body: ApiObservationsPost201Response = ObjectSerializer.deserialize(
                ObjectSerializer.parse(await response.body.text(), contentType),
                "ApiObservationsPost201Response", ""
            ) as ApiObservationsPost201Response;
            return body;
        }

        throw new ApiException<string | Blob | undefined>(response.httpStatusCode, "Unknown API Status Code!", await response.getBodyAsAny(), response.headers);
    }

}
