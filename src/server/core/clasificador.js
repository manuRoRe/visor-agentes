const VERBOS = {
  read: "lee",
  write: "crea",
  edit: "edita",
  multiedit: "edita",
  patch: "edita",
  glob: "busca archivos",
  list: "lista la carpeta",
  ls: "lista la carpeta",
  grep: "busca en el código",
  bash: "ejecuta",
  shell: "ejecuta",
  webfetch: "consulta la web",
  websearch: "busca en la web",
  todowrite: "actualiza su lista de tareas",
  todoread: "revisa su lista de tareas",
};

const EDITAN = new Set(["write", "edit", "multiedit", "patch"]);

const GIT = [
  [/gh\s+pr\s+create/, "abre una pull request"],
  [/gh\s+pr\s+(review|merge)/, "revisa la pull request"],
  [/git\s+push/, "sube la rama"],
  [/git\s+commit/, "hace commit"],
  [/git\s+(switch|checkout)\s+-[cb]/, "crea una rama"],
  [/npm\s+(run\s+)?test|npx\s+(jest|vitest)/, "lanza los tests"],
];

const recortar = (texto = "", max = 90) => (texto.length > max ? `${texto.slice(0, max - 1)}…` : texto);

export class Clasificador {
  #repos;

  constructor(repos = []) {
    this.#repos = repos;
  }

  repoDe(texto = "") {
    const repo = this.#repos.find((r) => r.carpeta && texto.includes(r.carpeta));
    return repo ? repo.id : null;
  }

  relativa(ruta = "") {
    for (const r of this.#repos) {
      const i = r.carpeta ? ruta.indexOf(r.carpeta) : -1;
      if (i >= 0) return ruta.slice(i);
    }
    return ruta.split("/").slice(-3).join("/");
  }

  git(comando = "") {
    const encontrado = GIT.find(([patron]) => patron.test(comando));
    return encontrado ? encontrado[1] : null;
  }

  accion(herramienta = "", args = {}) {
    const nombre = herramienta.toLowerCase();
    const archivo = args.file_path ?? args.filePath ?? args.path ?? "";
    const comando = args.command ?? args.cmd ?? "";
    const patron = args.pattern ?? args.query ?? args.url ?? "";
    const detalle = comando ? recortar(comando) : archivo ? this.relativa(archivo) : recortar(String(patron), 60);
    return {
      herramienta,
      verbo: VERBOS[nombre] ?? herramienta,
      detalle,
      repo: this.repoDe(`${archivo} ${comando}`),
      git: comando ? this.git(comando) : null,
      archivo: EDITAN.has(nombre) && archivo ? this.relativa(archivo) : null,
    };
  }

  resultado(salida = "") {
    const tests = /Tests?:\s+.*\d+ (passed|failed)[^\n]*/.exec(salida);
    const fallo = /\bFAIL\b|\d+ failed|Error:/i.test(salida);
    if (!tests && !fallo) return null;
    const linea = tests ? tests[0] : (salida.split("\n").find((l) => /error|fail/i.test(l)) ?? "error");
    return { ok: !fallo, texto: linea.trim() };
  }
}
