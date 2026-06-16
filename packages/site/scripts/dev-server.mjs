import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { dirname } from "node:path";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(packageRoot, "../..");
const requestedPort = Number.parseInt(process.env.PORT ?? "4173", 10);

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".svg", "image/svg+xml; charset=utf-8"]
]);

const resolveRequest = (url = "/") => {
  const pathname = decodeURIComponent(new URL(url, "http://localhost").pathname);
  const requestPath = pathname === "/" ? "/index.html" : pathname;
  const base = requestPath.startsWith("/assets/") ? repoRoot : packageRoot;
  const absolutePath = normalize(join(base, requestPath));

  if (!absolutePath.startsWith(base)) {
    return null;
  }

  return absolutePath;
};

const server = createServer(async (request, response) => {
  const filePath = resolveRequest(request.url);

  if (!filePath) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      throw new Error("Not a file");
    }

    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": mimeTypes.get(extname(filePath)) ?? "application/octet-stream"
    });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
});

server.listen(requestedPort, "127.0.0.1", () => {
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : requestedPort;
  console.log(`CodeAgora site preview: http://127.0.0.1:${port}`);
});
