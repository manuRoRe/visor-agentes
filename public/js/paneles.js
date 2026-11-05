import { escapar, hora } from "./formato.js";

export class Registro {
  #contenedor;
  #catalogo;
  #maximo;

  constructor(contenedor, catalogo, maximo = 30) {
    this.#contenedor = contenedor;
    this.#catalogo = catalogo;
    this.#maximo = maximo;
  }

  reiniciar() {
    this.#contenedor.replaceChildren();
  }

  agregar({ ts, agente, html, clase = "", etiqueta }) {
    const info = this.#catalogo.info(agente);
    const linea = document.createElement("div");
    linea.className = `linea ${clase}`;
    linea.style.setProperty("--c", info.color);
    linea.innerHTML = `<span class="hora">${hora(ts)}</span><span class="quien"></span><span class="que">${html}</span>${
      etiqueta ? `<span class="tag">${escapar(etiqueta)}</span>` : "<span></span>"
    }`;
    linea.querySelector(".quien").textContent = info.nombre;
    this.#contenedor.prepend(linea);
    while (this.#contenedor.children.length > this.#maximo) this.#contenedor.lastChild.remove();
  }
}

export class Archivos {
  #contenedor;
  #catalogo;
  #porRepo = {};

  constructor(contenedor, catalogo) {
    this.#contenedor = contenedor;
    this.#catalogo = catalogo;
  }

  get total() {
    return Object.values(this.#porRepo).flat().length;
  }

  reiniciar() {
    this.#porRepo = {};
    this.#pintar();
  }

  tocar(repoId, archivo, agente) {
    const id = repoId ?? this.#catalogo.repos[0]?.id ?? "repo";
    const lista = (this.#porRepo[id] ?? []).filter((f) => f.archivo !== archivo);
    lista.push({ archivo, agente });
    this.#porRepo[id] = lista;
    this.#pintar();
  }

  #pintar() {
    const repos = this.#catalogo.repos.length ? this.#catalogo.repos : [{ id: "repo", nombre: "repositorio" }];
    this.#contenedor.replaceChildren(...repos.map((repo) => this.#tarjeta(repo)));
  }

  #tarjeta(repo) {
    const lista = this.#porRepo[repo.id] ?? [];
    const tarjeta = document.createElement("div");
    tarjeta.className = "repo";
    tarjeta.innerHTML = `<h3><span></span><span class="cuenta">${lista.length} archivos</span></h3><ul></ul>`;
    tarjeta.querySelector("h3 span").textContent = repo.nombre;
    const ul = tarjeta.querySelector("ul");
    if (!lista.length) ul.innerHTML = `<li class="vacio" style="--c:transparent">sin cambios</li>`;
    lista
      .slice(-9)
      .reverse()
      .forEach((f, i) => {
        const li = document.createElement("li");
        const prefijo = repo.carpeta ? `${repo.carpeta}/` : "";
        li.textContent = prefijo && f.archivo.startsWith(prefijo) ? f.archivo.slice(prefijo.length) : f.archivo;
        li.style.setProperty("--c", this.#catalogo.info(f.agente).color);
        if (i === 0) li.className = "nuevo";
        ul.appendChild(li);
      });
    return tarjeta;
  }
}

export class PanelGitHub {
  #contenedor;
  #eventos = [];
  #remoto = null;

  constructor(contenedor) {
    this.#contenedor = contenedor;
  }

  reiniciar() {
    this.#eventos = [];
    this.#pintar();
  }

  accionGit(git, detalle) {
    this.#eventos.push({ git, detalle });
    this.#pintar();
  }

  actualizar(remoto) {
    this.#remoto = remoto;
    this.#pintar();
  }

  #pintar() {
    const filas = this.#eventos
      .slice(-3)
      .reverse()
      .map((e) => this.#fila("va", e.git, e.detalle));
    for (const repo of this.#remoto?.repos ?? []) {
      for (const pr of (repo.prs ?? []).slice(0, 2))
        filas.push(this.#fila("pr", `PR #${pr.number} · ${pr.state.toLowerCase()}`, pr.title));
      for (const run of (repo.runs ?? []).slice(0, 1)) {
        const enCurso = run.status !== "completed";
        const ok = run.conclusion === "success";
        filas.push(
          this.#fila(
            enCurso ? "va" : ok ? "ok" : "mal",
            enCurso ? "Actions en marcha" : ok ? "Actions ✓" : "Actions ✗",
            run.displayTitle ?? run.name,
          ),
        );
      }
    }
    if (!filas.length && this.#remoto?.error) filas.push(`<p class="vacio">${escapar(this.#remoto.error)}</p>`);
    this.#contenedor.innerHTML = filas.length
      ? filas.join("")
      : `<p class="vacio">Ramas, commits y PR aparecerán aquí</p>`;
  }

  #fila(clase, etiqueta, texto) {
    return `<div class="fila"><span class="pill ${clase}">${escapar(etiqueta)}</span><span class="t">${escapar(texto)}</span></div>`;
  }
}
