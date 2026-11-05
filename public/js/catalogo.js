const PALETA = ["#5CE1E6", "#FFD166", "#FF9B54", "#C792EA", "#9FE2A8", "#FF8A95", "#7FB8FF", "#E6EEF5"];
const COLORES_REPO = ["#FF9B54", "#C792EA", "#7FB8FF", "#9FE2A8"];

export const ORQUESTADOR = "orquestador";
export const GITHUB = "github";

export class Catalogo {
  #config = { titulo: "", orden: [ORQUESTADOR], agentes: {}, repos: [] };
  #cadena = [];

  cargar(config) {
    this.#config = { ...this.#config, ...config };
    this.#cadena = [];
  }

  get titulo() {
    return this.#config.titulo;
  }

  get orden() {
    return this.#config.orden;
  }

  get repos() {
    return this.#config.repos;
  }

  get cadena() {
    return this.#cadena;
  }

  registrar(id) {
    if (id !== ORQUESTADOR && !this.esRecurso(id) && !this.#cadena.includes(id)) this.#cadena.push(id);
  }

  esRecurso(id) {
    return id === GITHUB || this.#config.repos.some((r) => r.id === id);
  }

  repo(id) {
    return this.#config.repos.find((r) => r.id === id);
  }

  info(id) {
    if (id === GITHUB) return { nombre: "GitHub", rol: "rama · commits · PR", color: "#E6EEF5" };
    const i = this.#config.repos.findIndex((r) => r.id === id);
    if (i >= 0)
      return { nombre: this.#config.repos[i].nombre, rol: "repositorio", color: COLORES_REPO[i % COLORES_REPO.length] };
    const agente = this.#config.agentes[id] ?? {};
    const posicion = this.#cadena.indexOf(id);
    return {
      nombre: agente.nombre ?? id,
      rol: agente.rol ?? "",
      color: agente.color ?? PALETA[(posicion < 0 ? this.#cadena.length : posicion + 1) % PALETA.length],
    };
  }
}
