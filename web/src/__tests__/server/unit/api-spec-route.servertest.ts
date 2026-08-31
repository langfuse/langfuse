import handler from "@/src/pages/api/spec";
import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";

const callHandler = (method: "GET" | "HEAD" | "POST") => {
  const { req, res } = createMocks<NextApiRequest, NextApiResponse>({ method });
  handler(req, res);
  return res;
};

describe("/api/spec", () => {
  it("renders the deployed API specification", () => {
    const res = callHandler("GET");
    const body = res._getData() as string;

    expect(res.statusCode).toBe(200);
    expect(res.getHeader("Content-Type")).toBe("text/html; charset=utf-8");
    expect(body).toContain("<title>Langfuse API Reference</title>");
    expect(body).toContain('url: "../../generated/api/openapi.yml"');
    expect(body).toContain(
      "https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.67.0",
    );
  });

  it("supports metadata requests without sending the document", () => {
    const res = callHandler("HEAD");

    expect(res.statusCode).toBe(200);
    expect(res.getHeader("Content-Type")).toBe("text/html; charset=utf-8");
    expect(res._getData()).toBe("");
  });

  it("rejects unsupported methods", () => {
    const res = callHandler("POST");

    expect(res.statusCode).toBe(405);
    expect(res.getHeader("Allow")).toBe("GET, HEAD");
  });
});
