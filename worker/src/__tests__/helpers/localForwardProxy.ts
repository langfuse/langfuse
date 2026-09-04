import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { connect as netConnect, type AddressInfo } from "node:net";
import type { Duplex } from "node:stream";

export type LocalForwardProxy = {
  url: string;
  /**
   * One entry per request that traversed the proxy: the absolute-form URL for
   * plain HTTP proxying, or "host:port" for CONNECT tunnels.
   */
  targets: string[];
  close: () => Promise<void>;
};

/**
 * Minimal HTTP forward proxy for tests. Supports both mechanisms a proxy
 * client may use: CONNECT tunneling (undici ProxyAgent's default for every
 * target) and absolute-form proxying of plain HTTP requests.
 */
export async function startLocalForwardProxy(): Promise<LocalForwardProxy> {
  const targets: string[] = [];
  // CONNECT hijacks sockets out of the server's HTTP connection tracking, so
  // closeAllConnections() misses them and server.close() would wait for the
  // peer. Track every socket explicitly and destroy them on close().
  const sockets = new Set<Duplex>();
  const trackSocket = (socket: Duplex) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  };

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const targetUrl = req.url ?? "";
    targets.push(targetUrl);

    const target = new URL(targetUrl);
    const upstream = httpRequest(
      {
        hostname: target.hostname,
        port: target.port,
        path: `${target.pathname}${target.search}`,
        method: req.method,
        headers: { ...req.headers, host: target.host },
      },
      (upstreamRes) => {
        res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
        upstreamRes.pipe(res);
      },
    );
    upstream.on("error", () => {
      res.statusCode = 502;
      res.end();
    });
    req.pipe(upstream);
  });

  server.on("connection", trackSocket);

  server.on(
    "connect",
    (req: IncomingMessage, clientSocket: Duplex, head: Buffer) => {
      const target = req.url ?? "";
      targets.push(target);

      const [host, port] = target.split(":");
      const upstream = netConnect(Number(port), host, () => {
        clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        upstream.write(head);
        clientSocket.pipe(upstream);
        upstream.pipe(clientSocket);
      });
      trackSocket(upstream);
      upstream.on("error", () => clientSocket.destroy());
      upstream.on("close", () => clientSocket.destroy());
      clientSocket.on("error", () => upstream.destroy());
      clientSocket.on("close", () => upstream.destroy());
    },
  );

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;

  return {
    url: `http://127.0.0.1:${port}`,
    targets,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
        // Keep-alive and tunneled sockets would otherwise keep close() pending.
        server.closeAllConnections();
        for (const socket of sockets) socket.destroy();
      }),
  };
}
