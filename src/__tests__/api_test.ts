/**
 * @jest-environment node
 */

import { type NextApiRequest, type NextApiResponse } from "next";
import handler from "../pages/api/public/traces";

import {
  createRequest,
  createResponse,
  type RequestOptions,
} from "node-mocks-http";

type ApiRequest = NextApiRequest & ReturnType<typeof createRequest>;
type APiResponse = NextApiResponse & ReturnType<typeof createResponse>;

describe("/api/public/traces API Endpoint", () => {
  function mockRequestResponse(method: RequestMethod = "GET") {
    const options: RequestOptions = {
      "Content-Type": "application/json",
      authorization: createBasicAuthHeader(
        "pk-lf-1234567890",
        "sk-lf-1234567890"
      ),
    };
    const req: ApiRequest = createRequest<ApiRequest>(options);

    const res: APiResponse = createResponse<APiResponse>();

    console.log(req.headers);
    // req.query = { gatewayID: `${gatewayID}` };
    return { req, res };
  }

  it("should create a trace", async () => {
    const { req, res } = mockRequestResponse();

    req.method = "POST";
    req.body = {
      external_id: "1234567890",
    };

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.statusMessage).toEqual("OK");
    expect(JSON.parse(res._getJSONData())).toEqual({
      err: "Unable to find device",
    });
  });
});

function createBasicAuthHeader(username: string, password: string): string {
  const base64Credentials = Buffer.from(`${username}:${password}`).toString(
    "base64"
  );
  return `Basic ${base64Credentials}`;
}
