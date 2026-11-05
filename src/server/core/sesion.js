export const ORQUESTADOR = "orquestador";

export const TIPOS = ["inicio", "orden", "delegar", "entregar", "accion", "resultado", "tokens", "estado", "turno-fin"];

export class Sesion {
  #difusor;
  #clasificador;
  #estados = new Map();
  #tokens = new Map();

  constructor(difusor, clasificador) {
    this.#difusor = difusor;
    this.#clasificador = clasificador;
  }

  aplicar(evento) {
    const ts = evento.ts ?? Date.now();
    const manejador = this.#manejadores[evento.tipo];
    if (!manejador) return false;
    manejador.call(this, evento, ts);
    return true;
  }

  reiniciar() {
    this.#estados.clear();
    this.#tokens.clear();
    this.#difusor.limpiar();
    this.#emitir({ tipo: "reset" });
  }

  estado(agente) {
    return this.#estados.get(agente);
  }

  agentesTrabajando() {
    return [...this.#estados].filter(([a, e]) => a !== ORQUESTADOR && e === "trabajando").map(([a]) => a);
  }

  #manejadores = {
    inicio() {
      this.reiniciar();
    },

    orden({ texto = "" }, ts) {
      this.#emitir({ tipo: "orden", texto, ts });
      this.#cambiarEstado(ORQUESTADOR, "trabajando", ts);
    },

    delegar({ de = ORQUESTADOR, a, texto = "" }, ts) {
      if (!a) return;
      this.#emitir({ tipo: "handoff", de, a, texto: String(texto).slice(0, 200), ts });
      this.#cambiarEstado(a, "trabajando", ts);
    },

    entregar({ de, a = ORQUESTADOR, texto = "" }, ts) {
      if (!de) return;
      this.#cambiarEstado(de, "hecho", ts);
      this.#emitir({ tipo: "handoff", de, a, texto: String(texto || "terminado").slice(0, 200), vuelta: true, ts });
      if (a === ORQUESTADOR) this.#cambiarEstado(ORQUESTADOR, "trabajando", ts);
    },

    accion({ agente = ORQUESTADOR, herramienta = "", args = {} }, ts) {
      if (this.#estados.get(agente) !== "trabajando") this.#cambiarEstado(agente, "trabajando", ts);
      this.#emitir({ tipo: "accion", agente, ...this.#clasificador.accion(herramienta, args), ts });
    },

    resultado({ agente = ORQUESTADOR, salida, ok, texto }, ts) {
      const r = salida !== undefined ? this.#clasificador.resultado(String(salida)) : { ok: ok !== false, texto };
      if (r && r.texto) this.#emitir({ tipo: "resultado", agente, ...r, ts });
    },

    tokens({ agente = ORQUESTADOR, total = 0, porAgente }, ts) {
      const lote = porAgente ?? { [agente]: total };
      for (const [nombre, valor] of Object.entries(lote)) {
        this.#tokens.set(nombre, Math.max(this.#tokens.get(nombre) ?? 0, Number(valor) || 0));
      }
      this.#emitirTokens(ts);
    },

    estado({ agente, estado }, ts) {
      if (agente && estado) this.#cambiarEstado(agente, estado, ts);
    },

    "turno-fin"(_, ts) {
      if (this.agentesTrabajando().length) {
        this.#emitir({ tipo: "espera", ts });
        return;
      }
      this.#cambiarEstado(ORQUESTADOR, "hecho", ts);
      this.#emitirTokens(ts);
      this.#emitir({ tipo: "fin", ts });
    },
  };

  #cambiarEstado(agente, estado, ts) {
    this.#estados.set(agente, estado);
    this.#emitir({ tipo: "estado", agente, estado, ts });
  }

  #emitirTokens(ts) {
    const porAgente = Object.fromEntries(this.#tokens);
    const total = [...this.#tokens.values()].reduce((a, b) => a + b, 0);
    this.#emitir({ tipo: "tokens", total, porAgente, ts });
  }

  #emitir(evento) {
    this.#difusor.emitir(evento);
  }
}
