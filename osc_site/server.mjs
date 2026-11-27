import { createServer } from "node:http";
import { isIP } from "node:net";
import next from "next";
import httpProxy from "http-proxy";

const dev = process.argv.includes("--dev");
const port = Number(process.env.PORT || 3000);
const origin = process.env.APP_ORIGIN || ("http://localhost:" + port);
const app = next({ dev, port });
await app.prepare();
const handle = app.getRequestHandler();
const upgrade = app.getUpgradeHandler();
const proxy = httpProxy.createProxyServer({ changeOrigin: true });
const server = createServer((request, response) => {
  delete request.headers["x-pam-peer-ip"];
  if (request.url?.startsWith("/api/proxy/pam/")) {
    const incoming = process.env.PAM_TRUST_PROXY_IP === "true"
      ? request.headers["x-real-ip"] : request.socket.remoteAddress;
    if (typeof incoming === "string" && isIP(incoming)) request.headers["x-pam-peer-ip"] = incoming;
  }
  return handle(request, response);
});

server.on("upgrade", (request, socket, head) => {
  if (dev && request.url?.split("?")[0] === "/_next/webpack-hmr") {
    void upgrade(request, socket, head);
    return;
  }
  const reject = status => socket.end("HTTP/1.1 " + status + "\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
  const pam = request.url === "/api/v1/pam/ssh/tunnel";
  if (request.method !== "GET" || (!pam && !/^\/api\/v1\/containers\/[a-f0-9]{64}\/(exec|logs)$/.test(request.url))) {
    return reject("404 Not Found");
  }
  if (request.headers.origin !== origin) return reject("403 Forbidden");
  const session = request.headers.cookie?.split(";").map(part => part.trim())
    .find(part => part.startsWith("omnisight_session="))?.slice("omnisight_session=".length);
  if (!session) return reject("401 Unauthorized");
  const target = process.env.INTERNAL_API_URL;
  if (!target) return reject("503 Service Unavailable");
  const headers = request.headers;
  request.headers = {
    connection: "Upgrade", upgrade: "websocket", authorization: "Bearer " + session,
    "sec-websocket-key": headers["sec-websocket-key"], "sec-websocket-version": headers["sec-websocket-version"],
  };
  if (!request.headers["sec-websocket-key"] || request.headers["sec-websocket-version"] !== "13") {
    return reject("400 Bad Request");
  }
  if (pam) {
    const protocols = headers["sec-websocket-protocol"];
    if (typeof protocols !== "string" || !/^pam\.ssh\.v1,\s*ticket\.[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(protocols)) {
      return reject("400 Bad Request");
    }
    delete request.headers.authorization;
    request.headers["sec-websocket-protocol"] = protocols;
  }
  proxy.ws(request, socket, head, { target }, () => socket.destroy());
});

server.listen(port);
