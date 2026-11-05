import { readFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

export function servirEstaticos(carpeta) {
  const raiz = normalize(carpeta + sep);
  return async (req, res) => {
    const ruta = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const destino = normalize(join(raiz, ruta === "/" ? "index.html" : ruta));
    if (!destino.startsWith(raiz)) return false;
    try {
      const contenido = await readFile(destino);
      res.writeHead(200, { "Content-Type": TIPOS[extname(destino)] ?? "application/octet-stream" });
      res.end(contenido);
      return true;
    } catch {
      return false;
    }
  };
}
