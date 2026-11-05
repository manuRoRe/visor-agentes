import { readFileSync } from "node:fs";
import { dirname, join, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";

export const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const BASE = {
  titulo: "Equipo de agentes",
  puerto: 4545,
  repos: [],
  orden: ["orquestador"],
  agentes: {},
};

function normalizarRepo(repo) {
  const ruta = repo.ruta ? resolve(RAIZ, repo.ruta) : null;
  return {
    id: repo.id,
    nombre: repo.nombre ?? (ruta ? basename(ruta) : repo.id),
    carpeta: repo.carpeta ?? (ruta ? basename(ruta) : (repo.nombre ?? repo.id)),
    ruta,
    github: repo.github || null,
  };
}

export function cargarConfig(ruta = join(RAIZ, "config.json")) {
  let leida = {};
  try {
    leida = JSON.parse(readFileSync(ruta, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") console.error(`config.json no es válido: ${error.message}`);
  }
  const config = { ...BASE, ...leida };
  config.repos = (config.repos ?? []).map(normalizarRepo);
  config.puerto = Number(process.env.PORT ?? config.puerto);
  return config;
}

export function configPublica(config) {
  const { titulo, orden, agentes } = config;
  const repos = config.repos.map(({ id, nombre, carpeta, github }) => ({ id, nombre, carpeta, github }));
  return { titulo, orden, agentes, repos };
}
