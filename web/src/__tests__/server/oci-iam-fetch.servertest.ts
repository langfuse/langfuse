/** @jest-environment node */

import { buildOciIamFetch } from "@langfuse/shared/src/server";

describe("OCI IAM fetch signing", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("signs OpenAI-compatible OCI requests before sending them", async () => {
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));

    const ociFetch = buildOciIamFetch({
      credentials: {
        tenancyId: "ocid1.tenancy.oc1..example",
        userId: "ocid1.user.oc1..example",
        fingerprint: "12:34:56:78:90:ab:cd:ef",
        privateKey: `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCtGvmUqLlumDwO
pvc0qK6c+FUYqkKgRAir+wjcBRexu6SkRp43aB5bkAaagGJnqtvhf+bCIlnrCvvz
IkD9viiAD1kPXS9pVSabRO2Uf5pGUVcn0ZX1lsoumhp8fF9tm6XJv7LnB00LwSSR
r/if03PgIitOWIfAgIgDdrXVo19IoHxTF6W0nZKu/K1PT6M47oSMH/aWx21i7z6b
mX7eXOF+7fJA1zw89wyky2BsH10LGrrP+ylzRgm1Opih+iMPYEUSuUicDvuouPiX
sZ5Pw0gg5gvGBkd4z7psmSJ4aAMxrmdiNwj9zPfPpE7TF2VXc4qyLrpI9s4ooPbS
R8iU0P8NAgMBAAECggEAD2UhQjfZOf0/BhySSrQfx2UMiGOIBmHWlZj/WjX3u/5Q
r616H7paTNFbzPzTA5497Omnl6dfcNhqvN5UglyZlH4I8SVb9JW2l8ODD5xjl5Jf
WnK4z/0noQpihaS4BfL8RRuP6R0MnJmCS5SnW2t+WDYhvNeBxzyHHCvAEy5y6G37
+iSFl15SGrNbAl2viu3fC2X0wzjJKV90Ot2AUXv78jWV7QwDn6e9NQ1TOW6YjOGt
+Uk70eoorJ6IENyASKgVD4aG57tmqx2w6e+DDFZB6w+nNdt3ikvg9OqIVy771Z3u
LkiyzykrzOIRT2AYnPy4ndVbdHY69bH4/KZpoiKrLwKBgQDZRBObp+3MoGxE6P/R
HCLMkCt49s3Mh260PvgUuGcmAKrrotNIyvHaLT/OApOGKpl7/0eYgKoc9kQcrPdM
uBYX/zO6fX/boO21NvZUHYAnc+PRV7z/piGll2U6f1/g8VNBjx1gF3VgnaCf/oOs
krcnRoVcqhcwgxRUOd6wWWlKlwKBgQDL9239tlbxQNtOyIj3qSyzKbMr5mbvAoWW
Rc2GvgFD10TBPIhvO389oeJ7TEex6uHhX1nwQIy+7EgKF/36PYkKgTw68QU2zaW1
X0Ny9nLnV+2ux66Rxrb8h+waq95MFTDhsSdb/5OGJrXSkEKkXO7qi2V+TnzngUXN
gHo2Oo6r+wKBgBNXNg+jMU4H8dtoim1I/egL5XLNNaDBZZ9yA4+EotoFMTHsurY+
Kq1rXcSvAgbtf+BD51GyEnKlkYaj9xfDQ2Q7eZVeWqVofACnteHjBmd8r4kRMGfp
mBEvmvlMIXLayLiLTugg7nf9UDEt7PbN0LQUWQbYtVvCL2sYA7TbIL5dAoGAc5kE
7pEkD1FZufnvnqVz3wrYMB5B4l4EhhmDlUUkhGWB4x7CmIAY6j5QlN6zl4Nuh4O5
/m8nFaHmZkoYuHWdsKV0FFe7Q8cjjnqySHqivrjXzYIAT0BXPyJtzuPvdiFgddko
XHyqCJLx46e9DVhaU/WzDPXA1pgujnytRwTDDXcCgYEAoF/5gIz/UP2bSksGBh3N
vb88UxjcBQCifa7Uu3Xz2SEGm5+howZ8TZmbUskG3NNYq0aj9Pp3rzy4TJBZyPmu
ZmqbyAA334VqYnHaXq/bbmgQQfEGsZWE3rfXms+vx1EXVpO78NFHuXGJsZJ2QVcc
Ajkub+uJkGqjbz7QpGz8Oo0=
-----END PRIVATE KEY-----`,
      },
      baseURL:
        "https://inference.generativeai.us-chicago-1.oci.oraclecloud.com/openai/v1",
    });

    await ociFetch(
      "https://inference.generativeai.us-chicago-1.oci.oraclecloud.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "xai.grok-4-fast",
          messages: [{ role: "user", content: "ping" }],
        }),
      },
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [request] = fetchSpy.mock.calls[0];
    const signedRequest = request as Request;
    expect(signedRequest.headers.get("authorization")).toContain(
      'Signature version="1"',
    );
    expect(signedRequest.headers.get("host")).toBe(
      "inference.generativeai.us-chicago-1.oci.oraclecloud.com",
    );
    expect(signedRequest.headers.get("x-content-sha256")).toBeTruthy();
    expect(signedRequest.headers.get("content-length")).toBeTruthy();
    expect(signedRequest.method).toBe("POST");
    expect(await signedRequest.text()).toContain('"model":"xai.grok-4-fast"');
  });

  it("rejects cross-origin OCI IAM requests", async () => {
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));

    const ociFetch = buildOciIamFetch({
      credentials: {
        tenancyId: "ocid1.tenancy.oc1..example",
        userId: "ocid1.user.oc1..example",
        fingerprint: "12:34:56:78:90:ab:cd:ef",
        privateKey: `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCtGvmUqLlumDwO
pvc0qK6c+FUYqkKgRAir+wjcBRexu6SkRp43aB5bkAaagGJnqtvhf+bCIlnrCvvz
IkD9viiAD1kPXS9pVSabRO2Uf5pGUVcn0ZX1lsoumhp8fF9tm6XJv7LnB00LwSSR
r/if03PgIitOWIfAgIgDdrXVo19IoHxTF6W0nZKu/K1PT6M47oSMH/aWx21i7z6b
mX7eXOF+7fJA1zw89wyky2BsH10LGrrP+ylzRgm1Opih+iMPYEUSuUicDvuouPiX
sZ5Pw0gg5gvGBkd4z7psmSJ4aAMxrmdiNwj9zPfPpE7TF2VXc4qyLrpI9s4ooPbS
R8iU0P8NAgMBAAECggEAD2UhQjfZOf0/BhySSrQfx2UMiGOIBmHWlZj/WjX3u/5Q
r616H7paTNFbzPzTA5497Omnl6dfcNhqvN5UglyZlH4I8SVb9JW2l8ODD5xjl5Jf
WnK4z/0noQpihaS4BfL8RRuP6R0MnJmCS5SnW2t+WDYhvNeBxzyHHCvAEy5y6G37
+iSFl15SGrNbAl2viu3fC2X0wzjJKV90Ot2AUXv78jWV7QwDn6e9NQ1TOW6YjOGt
+Uk70eoorJ6IENyASKgVD4aG57tmqx2w6e+DDFZB6w+nNdt3ikvg9OqIVy771Z3u
LkiyzykrzOIRT2AYnPy4ndVbdHY69bH4/KZpoiKrLwKBgQDZRBObp+3MoGxE6P/R
HCLMkCt49s3Mh260PvgUuGcmAKrrotNIyvHaLT/OApOGKpl7/0eYgKoc9kQcrPdM
uBYX/zO6fX/boO21NvZUHYAnc+PRV7z/piGll2U6f1/g8VNBjx1gF3VgnaCf/oOs
krcnRoVcqhcwgxRUOd6wWWlKlwKBgQDL9239tlbxQNtOyIj3qSyzKbMr5mbvAoWW
Rc2GvgFD10TBPIhvO389oeJ7TEex6uHhX1nwQIy+7EgKF/36PYkKgTw68QU2zaW1
X0Ny9nLnV+2ux66Rxrb8h+waq95MFTDhsSdb/5OGJrXSkEKkXO7qi2V+TnzngUXN
gHo2Oo6r+wKBgBNXNg+jMU4H8dtoim1I/egL5XLNNaDBZZ9yA4+EotoFMTHsurY+
Kq1rXcSvAgbtf+BD51GyEnKlkYaj9xfDQ2Q7eZVeWqVofACnteHjBmd8r4kRMGfp
mBEvmvlMIXLayLiLTugg7nf9UDEt7PbN0LQUWQbYtVvCL2sYA7TbIL5dAoGAc5kE
7pEkD1FZufnvnqVz3wrYMB5B4l4EhhmDlUUkhGWB4x7CmIAY6j5QlN6zl4Nuh4O5
/m8nFaHmZkoYuHWdsKV0FFe7Q8cjjnqySHqivrjXzYIAT0BXPyJtzuPvdiFgddko
XHyqCJLx46e9DVhaU/WzDPXA1pgujnytRwTDDXcCgYEAoF/5gIz/UP2bSksGBh3N
vb88UxjcBQCifa7Uu3Xz2SEGm5+howZ8TZmbUskG3NNYq0aj9Pp3rzy4TJBZyPmu
ZmqbyAA334VqYnHaXq/bbmgQQfEGsZWE3rfXms+vx1EXVpO78NFHuXGJsZJ2QVcc
Ajkub+uJkGqjbz7QpGz8Oo0=
-----END PRIVATE KEY-----`,
      },
      baseURL:
        "https://inference.generativeai.us-chicago-1.oci.oraclecloud.com/openai/v1",
    });

    await expect(
      ociFetch("https://example.com/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: "xai.grok-4-fast", messages: [] }),
      }),
    ).rejects.toThrow(
      "OCI IAM requests must stay on the configured OCI base URL origin.",
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("requires a base URL for OCI IAM origin pinning", () => {
    expect(() =>
      buildOciIamFetch({
        credentials: {
          tenancyId: "ocid1.tenancy.oc1..example",
          userId: "ocid1.user.oc1..example",
          fingerprint: "12:34:56:78:90:ab:cd:ef",
          privateKey: "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----",
          region: "us-chicago-1",
        },
        baseURL: null,
      }),
    ).toThrow("OCI IAM requires a base URL for origin pinning.");
  });

  it("drops user-controlled protected headers before OCI IAM signing", async () => {
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));

    const ociFetch = buildOciIamFetch({
      credentials: {
        tenancyId: "ocid1.tenancy.oc1..example",
        userId: "ocid1.user.oc1..example",
        fingerprint: "12:34:56:78:90:ab:cd:ef",
        privateKey: `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCtGvmUqLlumDwO
pvc0qK6c+FUYqkKgRAir+wjcBRexu6SkRp43aB5bkAaagGJnqtvhf+bCIlnrCvvz
IkD9viiAD1kPXS9pVSabRO2Uf5pGUVcn0ZX1lsoumhp8fF9tm6XJv7LnB00LwSSR
r/if03PgIitOWIfAgIgDdrXVo19IoHxTF6W0nZKu/K1PT6M47oSMH/aWx21i7z6b
mX7eXOF+7fJA1zw89wyky2BsH10LGrrP+ylzRgm1Opih+iMPYEUSuUicDvuouPiX
sZ5Pw0gg5gvGBkd4z7psmSJ4aAMxrmdiNwj9zPfPpE7TF2VXc4qyLrpI9s4ooPbS
R8iU0P8NAgMBAAECggEAD2UhQjfZOf0/BhySSrQfx2UMiGOIBmHWlZj/WjX3u/5Q
r616H7paTNFbzPzTA5497Omnl6dfcNhqvN5UglyZlH4I8SVb9JW2l8ODD5xjl5Jf
WnK4z/0noQpihaS4BfL8RRuP6R0MnJmCS5SnW2t+WDYhvNeBxzyHHCvAEy5y6G37
+iSFl15SGrNbAl2viu3fC2X0wzjJKV90Ot2AUXv78jWV7QwDn6e9NQ1TOW6YjOGt
+Uk70eoorJ6IENyASKgVD4aG57tmqx2w6e+DDFZB6w+nNdt3ikvg9OqIVy771Z3u
LkiyzykrzOIRT2AYnPy4ndVbdHY69bH4/KZpoiKrLwKBgQDZRBObp+3MoGxE6P/R
HCLMkCt49s3Mh260PvgUuGcmAKrrotNIyvHaLT/OApOGKpl7/0eYgKoc9kQcrPdM
uBYX/zO6fX/boO21NvZUHYAnc+PRV7z/piGll2U6f1/g8VNBjx1gF3VgnaCf/oOs
krcnRoVcqhcwgxRUOd6wWWlKlwKBgQDL9239tlbxQNtOyIj3qSyzKbMr5mbvAoWW
Rc2GvgFD10TBPIhvO389oeJ7TEex6uHhX1nwQIy+7EgKF/36PYkKgTw68QU2zaW1
X0Ny9nLnV+2ux66Rxrb8h+waq95MFTDhsSdb/5OGJrXSkEKkXO7qi2V+TnzngUXN
gHo2Oo6r+wKBgBNXNg+jMU4H8dtoim1I/egL5XLNNaDBZZ9yA4+EotoFMTHsurY+
Kq1rXcSvAgbtf+BD51GyEnKlkYaj9xfDQ2Q7eZVeWqVofACnteHjBmd8r4kRMGfp
mBEvmvlMIXLayLiLTugg7nf9UDEt7PbN0LQUWQbYtVvCL2sYA7TbIL5dAoGAc5kE
7pEkD1FZufnvnqVz3wrYMB5B4l4EhhmDlUUkhGWB4x7CmIAY6j5QlN6zl4Nuh4O5
/m8nFaHmZkoYuHWdsKV0FFe7Q8cjjnqySHqivrjXzYIAT0BXPyJtzuPvdiFgddko
XHyqCJLx46e9DVhaU/WzDPXA1pgujnytRwTDDXcCgYEAoF/5gIz/UP2bSksGBh3N
vb88UxjcBQCifa7Uu3Xz2SEGm5+howZ8TZmbUskG3NNYq0aj9Pp3rzy4TJBZyPmu
ZmqbyAA334VqYnHaXq/bbmgQQfEGsZWE3rfXms+vx1EXVpO78NFHuXGJsZJ2QVcc
Ajkub+uJkGqjbz7QpGz8Oo0=
-----END PRIVATE KEY-----`,
      },
      baseURL:
        "https://inference.generativeai.us-chicago-1.oci.oraclecloud.com/openai/v1",
    });

    await ociFetch(
      "https://inference.generativeai.us-chicago-1.oci.oraclecloud.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          authorization: "Bearer attacker-token",
          date: "Mon, 01 Jan 2024 00:00:00 GMT",
          host: "example.com",
          "content-length": "999",
          "x-content-sha256": "attacker-hash",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "xai.grok-4-fast",
          messages: [{ role: "user", content: "ping" }],
        }),
      },
    );

    const [request] = fetchSpy.mock.calls[0];
    const signedRequest = request as Request;
    expect(signedRequest.headers.get("authorization")).toContain(
      'Signature version="1"',
    );
    expect(signedRequest.headers.get("authorization")).not.toContain(
      "attacker-token",
    );
    expect(signedRequest.headers.get("x-content-sha256")).not.toBe(
      "attacker-hash",
    );
  });
});
