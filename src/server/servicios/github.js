import { execFile } from "node:child_process";

const gh = (args) =>
  new Promise((ok) => execFile("gh", args, { timeout: 8000 }, (error, salida) => ok(error ? null : salida)));

const leerJson = (texto) => {
  try {
    return JSON.parse(texto || "[]");
  } catch {
    return [];
  }
};

export class MonitorGitHub {
  #repos;
  #difusor;
  #intervalo;
  #temporizador = null;
  #ultimo = null;

  constructor(repos, difusor, intervalo = 6000) {
    this.#repos = repos.filter((r) => r.github);
    this.#difusor = difusor;
    this.#intervalo = intervalo;
  }

  get activo() {
    return this.#repos.length > 0;
  }

  get ultimo() {
    return this.#ultimo;
  }

  iniciar() {
    if (!this.activo) return;
    this.#refrescar();
    this.#temporizador = setInterval(() => this.#refrescar(), this.#intervalo);
  }

  detener() {
    clearInterval(this.#temporizador);
  }

  async #refrescar() {
    const repos = [];
    let error = null;
    for (const repo of this.#repos) {
      const prs = await gh([
        "pr",
        "list",
        "--repo",
        repo.github,
        "--state",
        "all",
        "--limit",
        "3",
        "--json",
        "number,title,state,headRefName,url",
      ]);
      const runs = await gh([
        "run",
        "list",
        "--repo",
        repo.github,
        "--limit",
        "3",
        "--json",
        "name,status,conclusion,headBranch,displayTitle",
      ]);
      if (prs === null && runs === null)
        error = "No se pudo usar gh: revisa «gh auth status» y el campo github de config.json";
      repos.push({ id: repo.id, github: repo.github, prs: leerJson(prs), runs: leerJson(runs) });
    }
    this.#ultimo = { tipo: "github", repos, error, actualizado: Date.now() };
    this.#difusor.emitir(this.#ultimo, { guardar: false });
  }
}
