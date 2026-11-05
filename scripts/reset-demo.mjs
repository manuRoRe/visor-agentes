#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { cargarConfig } from "../src/server/config.js";

const ejecutar = (comando, args, cwd) => {
  try {
    return execFileSync(comando, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch {
    return null;
  }
};

const ramaPrincipal = (cwd) =>
  ejecutar("git", ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], cwd)?.replace("origin/", "") ?? "main";

function limpiar(repo) {
  console.log(`── ${repo.nombre}`);
  if (!repo.ruta || !existsSync(join(repo.ruta, ".git"))) {
    console.log(`   no encuentro el repo en ${repo.ruta ?? "(sin ruta en config.json)"}`);
    return;
  }
  const cwd = repo.ruta;
  const abiertas = JSON.parse(ejecutar("gh", ["pr", "list", "--state", "open", "--json", "number"], cwd) ?? "[]");
  for (const { number } of abiertas) {
    ejecutar("gh", ["pr", "close", String(number), "--delete-branch"], cwd);
    console.log(`   PR #${number} cerrada y su rama borrada en GitHub`);
  }
  const principal = ramaPrincipal(cwd);
  ejecutar("git", ["switch", "-q", principal], cwd);
  ejecutar("git", ["pull", "-q"], cwd);
  const ramas = (ejecutar("git", ["branch", "--format=%(refname:short)"], cwd) ?? "")
    .split("\n")
    .filter((r) => r && r !== principal);
  for (const rama of ramas) {
    ejecutar("git", ["branch", "-D", "-q", rama], cwd);
    console.log(`   rama local ${rama} borrada`);
  }
  ejecutar("git", ["fetch", "-q", "--prune"], cwd);
  const pendientes = (ejecutar("git", ["status", "--porcelain"], cwd) ?? "")
    .split("\n")
    .filter((l) => l && !l.startsWith("??"));
  console.log(
    pendientes.length
      ? `   OJO: ${pendientes.length} archivos cambiados en ${principal} (revisa git status)`
      : `   ${principal} limpio`,
  );
}

const { repos } = cargarConfig();
if (!repos.length) console.log("config.json no tiene repos: añade al menos uno con su «ruta».");
repos.forEach(limpiar);
