import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

export function createStaticServer(directoryInput, portInput) {
  const directory = resolve(directoryInput ?? "");
  const port = Number(portInput ?? 0);

  if (!directory || !existsSync(directory) || !statSync(directory).isDirectory()) {
    throw new Error(`Static directory does not exist: ${directory}`);
  }
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Invalid static-server port: ${portInput ?? ""}`);
  }

  const server = createServer((request, response) => {
    const requestPath = decodeURIComponent(
      new URL(request.url ?? "/", "http://localhost").pathname,
    );
    const relativePath = normalize(requestPath).replace(/^[/\\]+/, "");
    let filePath = resolve(join(directory, relativePath || "index.html"));

    if (filePath !== directory && !filePath.startsWith(`${directory}${sep}`)) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    if (existsSync(filePath) && statSync(filePath).isDirectory()) {
      filePath = join(filePath, "index.html");
    }
    if (!existsSync(filePath) || !statSync(filePath).isFile()) {
      response.writeHead(404).end("Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": contentTypes[extname(filePath).toLowerCase()] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    });
    createReadStream(filePath).pipe(response);
  });

  return {
    listen: () =>
      new Promise((resolveListen, reject) => {
        server.once("error", reject);
        server.listen(port, "127.0.0.1", () => {
          server.off("error", reject);
          console.log(`Serving ${directory} at http://127.0.0.1:${port}`);
          resolveListen();
        });
      }),
    close: () =>
      new Promise((resolveClose, reject) => {
        server.close((error) => (error ? reject(error) : resolveClose()));
      }),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createStaticServer(process.argv[2], process.argv[3]);
  await server.listen();
}
