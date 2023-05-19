import typing_extensions

from openapi_client.paths import PathValues
from openapi_client.apis.paths.api_observations import ApiObservations

PathToApi = typing_extensions.TypedDict(
    'PathToApi',
    {
        PathValues.API_OBSERVATIONS: ApiObservations,
    }
)

path_to_api = PathToApi(
    {
        PathValues.API_OBSERVATIONS: ApiObservations,
    }
)
