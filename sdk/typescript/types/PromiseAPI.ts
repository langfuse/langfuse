import { ResponseContext, RequestContext, HttpFile } from '../http/http';
import { Configuration} from '../configuration'

import { ApiObservationsPost201Response } from '../models/ApiObservationsPost201Response';
import { ApiObservationsPost201ResponseObservation } from '../models/ApiObservationsPost201ResponseObservation';
import { ApiObservationsPost400Response } from '../models/ApiObservationsPost400Response';
import { ApiObservationsPostRequest } from '../models/ApiObservationsPostRequest';
import { ObservableDefaultApi } from './ObservableAPI';

import { DefaultApiRequestFactory, DefaultApiResponseProcessor} from "../apis/DefaultApi";
export class PromiseDefaultApi {
    private api: ObservableDefaultApi

    public constructor(
        configuration: Configuration,
        requestFactory?: DefaultApiRequestFactory,
        responseProcessor?: DefaultApiResponseProcessor
    ) {
        this.api = new ObservableDefaultApi(configuration, requestFactory, responseProcessor);
    }

    /**
     * Creates a new observation
     * @param apiObservationsPostRequest 
     */
    public apiObservationsPost(apiObservationsPostRequest: ApiObservationsPostRequest, _options?: Configuration): Promise<ApiObservationsPost201Response> {
        const result = this.api.apiObservationsPost(apiObservationsPostRequest, _options);
        return result.toPromise();
    }


}



