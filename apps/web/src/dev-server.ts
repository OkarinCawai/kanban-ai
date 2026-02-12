import { createServer } from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, "..", "..", "public");
const distDir = path.resolve(__dirname, "..");
const distSrcDir = path.resolve(distDir, "src");

const mimeByExtension = new Map<string, string>([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"]
]);

const isWithin = (root: string, target: string): boolean => {
  const normalizedRoot = path.resolve(root);
  const normalizedTarget = path.resolve(target);
  return (
    normalizedTarget === normalizedRoot ||
    normalizedTarget.startsWith(`${normalizedRoot}${path.sep}`)
  );
};

const server = createServer((req, res) => {
  const rawPath = req.url?.split("?")[0] ?? "/";
  let requestPath = "/";

  try {
    requestPath = decodeURIComponent(rawPath);
  } catch {
    res.statusCode = 400;
    res.end("Bad request.");
    return;
  }

  let finalPath = "";
  if (requestPath.startsWith("/src/")) {
    finalPath = path.resolve(distDir, `.${requestPath}`);
    if (!isWithin(distSrcDir, finalPath)) {
      res.statusCode = 403;
      res.end("Forbidden.");
      return;
    }
  } else {
    let safePath = requestPath;
    if (requestPath === "/" || requestPath === "/index.html") {
      safePath = "/index.html";
    } else if (/^\/[1-5]$/.test(requestPath)) {
      const designId = requestPath.slice(1);
      safePath = `/design-${designId}/index.html`;
    }

    finalPath = path.resolve(publicDir, `.${safePath}`);
    if (!isWithin(publicDir, finalPath)) {
      res.statusCode = 403;
      res.end("Forbidden.");
      return;
    }
  }

  try {
    if (!fs.existsSync(finalPath) || fs.statSync(finalPath).isDirectory()) {
      res.statusCode = 404;
      res.end("Not found.");
      return;
    }
  } catch {
    res.statusCode = 500;
    res.end("Server error.");
    return;
  }

  const extension = path.extname(finalPath);
  const contentType = mimeByExtension.get(extension) ?? "application/octet-stream";

  res.statusCode = 200;
  res.setHeader("Content-Type", contentType);
  // Dev server: avoid stale cached JS/HTML during rapid iteration.
  res.setHeader("Cache-Control", "no-store");
  fs.createReadStream(finalPath).pipe(res);
});

const port = Number(process.env.PORT ?? 3002);
server.listen(port, () => {
  process.stdout.write(`Web app running at http://localhost:${port}\n`);
});
