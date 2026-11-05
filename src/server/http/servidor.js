import http from "node:http";
import { servirEstaticos } from "./estaticos.js";
import { configPublica } from "../config.js";

const LIMITE_CUERPO = 5 * 1024 * 1024;

const leerJson = (req) =>
  new Promise((ok, mal) => {
    let cuerpo = "";
    req.on("data", (trozo) => {
      cuerpo += trozo;
      if (cuerpo.length > LIMITE_CUERPO) mal(new Error("cuerpo demasiado grande"));
    });
    req.on("end", () => {
      try {
        ok(JSON.parse(cuerpo || "{}"));
      } catch (error) {
        mal(error);
      }
    });
  });

const responder = (res, codigo, datos) => {
  res.writeHead(codigo, { "Content-Type": "application/json; charset=utf-8" });
  res.end(datos === undefined ? "" : JSON.stringify(datos));
};

export function crearServidor({ config, difusor, sesion, claude, github, demo, carpetaPublica }) {
  const estaticos = servirEstaticos(carpetaPublica);

  const rutas = {
    "GET /stream": (req, res) => {
      const antes = [{ tipo: "config", config: configPublica(config) }];
      const despues = github.ultimo ? [github.ultimo] : [];
      difusor.conectar(res, { antes, despues });
    },

    "GET /api/config": (req, res) => responder(res, 200, configPublica(config)),

    "POST /api/claude": async (req, res) => {
      claude.recibir(await leerJson(req));
      responder(res, 204);
    },

    "POST /api/eventos": async (req, res) => {
      const cuerpo = await leerJson(req);
      const lista = Array.isArray(cuerpo) ? cuerpo : [cuerpo];
      const aceptados = lista.filter((evento) => sesion.aplicar(evento)).length;
      responder(res, aceptados ? 202 : 400, { aceptados, recibidos: lista.length });
    },

    "POST /reset": (req, res) => {
      demo.detener();
      sesion.reiniciar();
      responder(res, 204);
    },

    "POST /demo": (req, res) => {
      demo.reproducir();
      responder(res, 204);
    },
  };
  rutas["POST /events"] = rutas["POST /api/claude"];

  return http.createServer(async (req, res) => {
    const clave = `${req.method} ${new URL(req.url, "http://x").pathname}`;
    try {
      if (rutas[clave]) return await rutas[clave](req, res);
      if (req.method === "GET" && (await estaticos(req, res))) return;
      responder(res, 404, { error: "no encontrado" });
    } catch (error) {
      responder(res, 400, { error: error.message });
    }
  });
}
