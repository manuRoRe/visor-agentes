import { Catalogo, ORQUESTADOR, GITHUB } from "./catalogo.js";
import { Diagrama } from "./diagrama.js";
import { Registro, Archivos, PanelGitHub } from "./paneles.js";
import { Marcador } from "./marcador.js";
import { Pasadas } from "./pasadas.js";
import { escapar, tokens as formatearTokens } from "./formato.js";

const TESTS = "lanza los tests";

export class App {
  #catalogo = new Catalogo();
  #pasadas = new Pasadas();
  #dom;
  #diagrama;
  #registro;
  #archivos;
  #github;
  #marcador;

  constructor(dom) {
    this.#dom = dom;
    this.#diagrama = new Diagrama({
      escenario: dom.escenario,
      capaAristas: dom.aristas,
      capaPaquetes: dom.paquetes,
      catalogo: this.#catalogo,
    });
    this.#registro = new Registro(dom.feed, this.#catalogo);
    this.#archivos = new Archivos(dom.repos, this.#catalogo);
    this.#github = new PanelGitHub(dom.github);
    this.#marcador = new Marcador(dom);
  }

  olvidarPasadas() {
    this.#pasadas.olvidar();
  }

  manejar(evento) {
    this.#manejadores[evento.tipo]?.call(this, evento);
  }

  #reiniciar() {
    this.#marcador.reiniciar();
    this.#registro.reiniciar();
    this.#archivos.reiniciar();
    this.#github.reiniciar();
    this.#diagrama.reiniciar();
  }

  #manejadores = {
    config({ config }) {
      this.#catalogo.cargar(config);
      this.#dom.titulo.textContent = config.titulo || "Equipo de agentes";
      this.#reiniciar();
    },

    reset() {
      this.#reiniciar();
    },

    orden({ texto, ts }) {
      this.#marcador.actividad(ts);
      this.#marcador.orden(`<b>Orden:</b> ${escapar(texto)}`);
      this.#registro.agregar({ ts, agente: ORQUESTADOR, html: "recibe la orden", clase: "handoff" });
    },

    estado({ agente, estado }) {
      this.#diagrama.estado(agente, estado);
    },

    espera() {
      this.#diagrama.estado(ORQUESTADOR, "esperando");
      this.#marcador.estado("esperando");
    },

    handoff(ev) {
      this.#marcador.actividad(ev.ts);
      this.#diagrama.traspaso(ev);
      const verbo = ev.vuelta ? "entrega su trabajo a" : "pasa la tarea a";
      const resumen = ev.texto ? ` · <code>${escapar(ev.texto.slice(0, 80))}</code>` : "";
      this.#registro.agregar({
        ts: ev.ts,
        agente: ev.de,
        html: `${verbo} <b>${escapar(this.#catalogo.info(ev.a).nombre)}</b>${resumen}`,
        clase: "handoff",
      });
    },

    accion(ev) {
      this.#marcador.actividad(ev.ts);
      this.#marcador.sumarAccion();
      const esGit = ev.git && ev.git !== TESTS;
      const destino = esGit ? GITHUB : ev.repo && this.#catalogo.repo(ev.repo) ? ev.repo : null;
      this.#diagrama.accion(ev.agente, `${ev.git ?? ev.verbo} ${ev.detalle ?? ""}`, destino);
      this.#registro.agregar({
        ts: ev.ts,
        agente: ev.agente,
        html: `${escapar(ev.git ?? ev.verbo)} <code>${escapar(ev.detalle ?? "")}</code>`,
        clase: ev.git ? "git" : "",
        etiqueta: this.#catalogo.repo(ev.repo)?.nombre,
      });
      if (ev.archivo) this.#archivos.tocar(ev.repo, ev.archivo, ev.agente);
      if (esGit) this.#github.accionGit(ev.git, ev.detalle);
    },

    resultado({ ts, agente, ok, texto }) {
      this.#marcador.actividad(ts);
      this.#registro.agregar({ ts, agente, html: escapar(texto), clase: ok ? "ok" : "mal" });
    },

    tokens({ total, porAgente }) {
      this.#marcador.fijarTokens(total ?? 0);
      this.#diagrama.tokens(porAgente);
    },

    github(ev) {
      this.#github.actualizar(ev);
    },

    fin({ ts }) {
      const resumen = `${this.#diagrama.agentesUsados()} agentes · ${this.#marcador.acciones} acciones · ${this.#archivos.total} archivos tocados`;
      const anterior = this.#pasadas.ultima();
      const actual = {
        tokens: this.#marcador.tokens,
        ms: this.#marcador.transcurrido,
        acciones: this.#marcador.acciones,
        ts: Date.now(),
      };
      this.#marcador.terminar(ts ?? Date.now(), resumen, this.#comparar(anterior, actual));
      this.#pasadas.guardar(actual);
    },
  };

  #comparar(anterior, actual) {
    if (!anterior?.tokens) return "";
    const diferencia = Math.round(((actual.tokens - anterior.tokens) / anterior.tokens) * 100);
    const clase = diferencia <= 0 ? "menos" : "mas";
    const signo = diferencia > 0 ? "+" : "";
    return `Pasada anterior: ${formatearTokens(anterior.tokens)} → ahora ${formatearTokens(actual.tokens)} · <span class="${clase}">${signo}${diferencia} %</span>`;
  }
}
