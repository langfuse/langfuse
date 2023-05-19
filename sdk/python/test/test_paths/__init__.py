import json
import typing

import urllib3
from urllib3._collections import HTTPHeaderDict


class ApiTestMixin:
    json_content_type = 'application/json'
    user_agent = 'OpenAPI-Generator/1.0.0/python'

    @classmethod
    def assert_pool_manager_request_called_with(
        cls,
        mock_request,
        url: str,
        method: str = 'POST',
        body: typing.Optional[bytes] = None,
        content_type: typing.Optional[str] = None,
        accept_content_type: typing.Optional[str] = None,
        stream: bool = False,
    ):
        headers = {
            'User-Agent': cls.user_agent
        }
        if accept_content_type:
            headers['Accept'] = accept_content_type
        if content_type:
            headers['Content-Type'] = content_type
        kwargs = dict(
            headers=HTTPHeaderDict(headers),
            preload_content=not stream,
            timeout=None,
        )
        if content_type and method != 'GET':
            kwargs['body'] = body
        mock_request.assert_called_with(
            method,
            url,
            **kwargs
        )

    @staticmethod
    def headers_for_content_type(content_type: str) -> typing.Dict[str, str]:
        return {'content-type': content_type}

    @classmethod
    def response(
        cls,
        body: typing.Union[str, bytes],
        status: int = 200,
        content_type: str = json_content_type,
        headers: typing.Optional[typing.Dict[str, str]] = None,
        preload_content: bool = True
    ) -> urllib3.HTTPResponse:
        if headers is None:
            headers = {}
        headers.update(cls.headers_for_content_type(content_type))
        return urllib3.HTTPResponse(
            body,
            headers=headers,
            status=status,
            preload_content=preload_content
        )

    @staticmethod
    def json_bytes(in_data: typing.Any) -> bytes:
        return json.dumps(in_data, separators=(",", ":"), ensure_ascii=False).encode('utf-8')
