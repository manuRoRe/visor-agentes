#!/usr/bin/env node
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  copyFileSync,
  cpSync,
  appendFileSync,
} from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PLANTILLAS = join(RAIZ, "plantillas");
const EVENTOS_CLAUDE = ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "SubagentStop", "Stop"];
const CON_MATCHER = new Set(["PreToolUse", "PostToolUse"]);
const URL_POR_DEFECTO = "http://localhost:4545/api/eventos";

const USO = `Uso:
  node scripts/instalar.mjs claude   <ruta-del-proyecto> [--skill] [--forzar]
  node scripts/instalar.mjs opencode <ruta-del-proyecto> [--skill] [--forzar] [--url http://host:puerto]

  --skill    copia también la skill «telegrafes»
  --forzar   sobrescribe los agentes que ya existan
  --url      dirección del visor si no está en http://localhost:4545`;

function leerArgumentos(argv) {
  const [sistema, ruta, ...resto] = argv;
  const opciones = { skill: resto.includes("--skill"), forzar: resto.includes("--forzar"), url: null };
  const i = resto.indexOf("--url");
  if (i >= 0) opciones.url = resto[i + 1]?.replace(/\/$/, "");
  return { sistema, ruta, opciones };
}

function salir(mensaje) {
  console.error(`\n${mensaje}\n\n${USO}\n`);
  process.exit(1);
}

function copiarAgentes(origen, destino, forzar) {
  mkdirSync(destino, { recursive: true });
  const resultado = { copiados: [], conservados: [] };
  for (const archivo of readdirSync(origen).filter((f) => f.endsWith(".md"))) {
    const objetivo = join(destino, archivo);
    if (existsSync(objetivo) && !forzar) {
      resultado.conservados.push(archivo);
      continue;
    }
    copyFileSync(join(origen, archivo), objetivo);
    resultado.copiados.push(archivo);
  }
  return resultado;
}

function copiarSkill(origen, destino) {
  mkdirSync(dirname(destino), { recursive: true });
  cpSync(origen, destino, { recursive: true });
}

function asegurarEnGitignore(proyecto, linea) {
  const ruta = join(proyecto, ".gitignore");
  const actual = existsSync(ruta) ? readFileSync(ruta, "utf8") : "";
  if (actual.split(/\r?\n/).includes(linea)) return false;
  appendFileSync(ruta, `${actual && !actual.endsWith("\n") ? "\n" : ""}${linea}\n`);
  return true;
}

function leerJson(ruta) {
  if (!existsSync(ruta)) return {};
  try {
    return JSON.parse(readFileSync(ruta, "utf8"));
  } catch {
    copyFileSync(ruta, `${ruta}.bak`);
    console.warn(`  ${ruta} no era JSON válido: se guarda una copia en .bak y se rehace`);
    return {};
  }
}

function comandoHook(url) {
  const hook = join(RAIZ, "hooks", "claude", "enviar.mjs");
  const comando = `node "${hook}"`;
  if (!url) return comando;
  return process.platform === "win32" ? comando : `VISOR_URL="${url}/api/claude" ${comando}`;
}

function instalarClaude(proyecto, { skill, forzar, url }) {
  const agentes = copiarAgentes(join(PLANTILLAS, "claude", "agents"), join(proyecto, ".claude", "agents"), forzar);

  const rutaAjustes = join(proyecto, ".claude", "settings.local.json");
  const ajustes = leerJson(rutaAjustes);
  ajustes.hooks ??= {};
  const comando = comandoHook(url);
  for (const evento of EVENTOS_CLAUDE) {
    const propios = (ajustes.hooks[evento] ?? []).filter(
      (grupo) => !(grupo.hooks ?? []).some((h) => /enviar\.mjs|send\.mjs/.test(h.command ?? "")),
    );
    const nuevo = {
      ...(CON_MATCHER.has(evento) ? { matcher: "*" } : {}),
      hooks: [{ type: "command", command: comando }],
    };
    ajustes.hooks[evento] = [...propios, nuevo];
  }
  writeFileSync(rutaAjustes, `${JSON.stringify(ajustes, null, 2)}\n`);

  if (skill)
    copiarSkill(join(PLANTILLAS, "claude", "skills", "telegrafes"), join(proyecto, ".claude", "skills", "telegrafes"));
  const ignorado = asegurarEnGitignore(proyecto, ".claude/settings.local.json");

  return {
    agentes,
    lineas: [
      `hooks en .claude/settings.local.json (${EVENTOS_CLAUDE.length} eventos)`,
      ignorado ? ".gitignore: añadido .claude/settings.local.json" : ".gitignore: ya ignoraba settings.local.json",
      skill ? "skill telegrafes en .claude/skills/" : null,
    ],
    siguiente: [
      "1. Arranca el visor:        npm start   (en la carpeta del visor)",
      "2. Abre el panel:           http://localhost:4545",
      `3. Abre Claude Code:        cd "${proyecto}" && claude`,
      "4. Comprueba en Claude:     /hooks  y  «¿qué subagentes tienes?»",
    ],
  };
}

function instalarOpenCode(proyecto, { skill, forzar, url }) {
  const agentes = copiarAgentes(join(PLANTILLAS, "opencode", "agents"), join(proyecto, ".opencode", "agents"), forzar);

  const destinoPlugin = join(proyecto, ".opencode", "plugins", "visor.js");
  mkdirSync(dirname(destinoPlugin), { recursive: true });
  let plugin = readFileSync(join(RAIZ, "plugins", "opencode", "visor.js"), "utf8");
  if (url) plugin = plugin.replace(URL_POR_DEFECTO, `${url}/api/eventos`);
  writeFileSync(destinoPlugin, plugin);

  if (skill)
    copiarSkill(
      join(PLANTILLAS, "claude", "skills", "telegrafes"),
      join(proyecto, ".opencode", "skills", "telegrafes"),
    );

  return {
    agentes,
    lineas: [
      `plugin en .opencode/plugins/visor.js → ${url ? `${url}/api/eventos` : URL_POR_DEFECTO}`,
      skill ? "skill telegrafes en .opencode/skills/" : null,
    ],
    siguiente: [
      "1. Arranca el visor:        npm start   (en la carpeta del visor)",
      "2. Abre el panel:           http://localhost:4545",
      `3. Abre OpenCode:           cd "${proyecto}" && opencode`,
      "4. Comprueba los agentes:   opencode agent list   (deben salir como subagent)",
    ],
  };
}

const { sistema, ruta, opciones } = leerArgumentos(process.argv.slice(2));
const instaladores = { claude: instalarClaude, opencode: instalarOpenCode };
if (!instaladores[sistema]) salir("Indica el sistema: claude u opencode.");
if (!ruta) salir("Indica la ruta del proyecto donde trabajarán los agentes.");
const proyecto = resolve(ruta);
if (!existsSync(proyecto)) salir(`No existe la carpeta: ${proyecto}`);

const { agentes, lineas, siguiente } = instaladores[sistema](proyecto, opciones);
console.log(`\nVisor de agentes · instalado para ${sistema} en ${proyecto}\n`);
if (agentes.copiados.length) console.log(`  agentes copiados: ${agentes.copiados.join(", ")}`);
if (agentes.conservados.length)
  console.log(`  agentes que ya tenías (no se tocan; usa --forzar): ${agentes.conservados.join(", ")}`);
for (const linea of lineas.filter(Boolean)) console.log(`  ${linea}`);
console.log(`\nSiguientes pasos:\n  ${siguiente.join("\n  ")}\n`);
