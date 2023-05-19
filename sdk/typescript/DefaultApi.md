# .DefaultApi

All URIs are relative to *http://localhost*

Method | HTTP request | Description
------------- | ------------- | -------------
[**apiObservationsPost**](DefaultApi.md#apiObservationsPost) | **POST** /api/observations | Creates a new observation


# **apiObservationsPost**
> ApiObservationsPost201Response apiObservationsPost(apiObservationsPostRequest)


### Example


```typescript
import {  } from '';
import * as fs from 'fs';

const configuration = .createConfiguration();
const apiInstance = new .DefaultApi(configuration);

let body:.DefaultApiApiObservationsPostRequest = {
  // ApiObservationsPostRequest
  apiObservationsPostRequest: {
    traceId: "traceId_example",
    type: "span",
    name: "name_example",
    startTime: new Date('1970-01-01T00:00:00.00Z'),
    endTime: new Date('1970-01-01T00:00:00.00Z'),
    attributes: {},
    parentObservationId: "parentObservationId_example",
  },
};

apiInstance.apiObservationsPost(body).then((data:any) => {
  console.log('API called successfully. Returned data: ' + data);
}).catch((error:any) => console.error(error));
```


### Parameters

Name | Type | Description  | Notes
------------- | ------------- | ------------- | -------------
 **apiObservationsPostRequest** | **ApiObservationsPostRequest**|  |


### Return type

**ApiObservationsPost201Response**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
**201** | Observation created successfully |  -  |
**400** | Invalid request data |  -  |
**405** | Method not allowed |  -  |

[[Back to top]](#) [[Back to API list]](README.md#documentation-for-api-endpoints) [[Back to Model list]](README.md#documentation-for-models) [[Back to README]](README.md)


