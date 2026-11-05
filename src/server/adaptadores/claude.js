import { ORQUESTADOR } from "../core/sesion.js";

const DELEGACION = new Set(["Task", "Agent"]);
const HANDBACK = /\[Subagent hand-back\]|<task-notification>|\[Background agent|<subagent[-_ ]result/i;
const LANZADO_EN_SEGUNDO_PLANO = /background|async|launched|segundo plano/i;

const sumarUso = (u = {}) =>
  (u.input_tokens ?? 0) +
  (u.output_tokens ?? 0) +
  (u.cache_read_input_tokens ?? 0) +
  (u.cache_creation_input_tokens ?? 0);

const totalTokens = (t) => (t ? t.input + t.output + t.cache_read + t.cache_write : 0);

const textoDe = (respuesta) => {
  if (typeof respuesta === "string") return respuesta;
  if (Array.isArray(respuesta?.content)) return respuesta.content.map((c) => c.text ?? "").join(" ");
  return respuesta?.result ?? "";
};

export class AdaptadorClaude {
  #sesion;
  #agentesConocidos;
  #pila = [];
  #porLlamada = new Map();
  #transcriptDe = new Map();
  #tokensPorTranscript = new Map();
  #tokensDeclarados = new Map();
  #principal = null;

  constructor(sesion, agentesConocidos = []) {
    this.#sesion = sesion;
    this.#agentesConocidos = agentesConocidos.filter((a) => a !== ORQUESTADOR);
  }

  recibir({ event, payload = {}, tokens, tokensAgente, ts = Date.now() }) {
    if (payload.transcript_path && tokens) this.#tokensPorTranscript.set(payload.transcript_path, totalTokens(tokens));
    if (payload.agent_type && tokensAgente) this.#declarar(payload.agent_type, totalTokens(tokensAgente));

    const manejador = this.#manejadores[event];
    if (manejador) manejador.call(this, payload, ts);
    this.#publicarTokens(ts);
  }

  #manejadores = {
    SessionStart(p, ts) {
      if (p.source === "startup" || p.source === "clear") this.#reiniciar(ts);
      this.#fijarPrincipal(p.transcript_path);
    },

    UserPromptSubmit(p, ts) {
      if (HANDBACK.test(String(p.prompt ?? "").slice(0, 400))) {
        const agente = this.#agenteDelInforme(p.prompt);
        if (agente) this.#sesion.aplicar({ tipo: "entregar", de: agente, texto: this.#limpiarInforme(p.prompt), ts });
        else this.#sesion.aplicar({ tipo: "estado", agente: ORQUESTADOR, estado: "trabajando", ts });
        return;
      }
      this.#fijarPrincipal(p.transcript_path);
      this.#sesion.aplicar({ tipo: "orden", texto: p.prompt ?? "", ts });
    },

    PreToolUse(p, ts) {
      const agente = this.#agenteActual(p);
      if (p.transcript_path && p.transcript_path !== this.#principal) this.#transcriptDe.set(p.transcript_path, agente);
      const args = p.tool_input ?? {};

      if (DELEGACION.has(p.tool_name)) {
        const destino = args.subagent_type ?? "subagente";
        this.#porLlamada.set(p.tool_use_id ?? `${destino}-${ts}`, destino);
        this.#pila.push(destino);
        this.#sesion.aplicar({
          tipo: "delegar",
          de: agente,
          a: destino,
          texto: args.description ?? args.prompt ?? "",
          ts,
        });
        return;
      }
      if (/handback/i.test(p.tool_name ?? "")) {
        this.#sesion.aplicar({
          tipo: "entregar",
          de: agente,
          texto: args.summary ?? args.report ?? args.result ?? "",
          ts,
        });
        return;
      }
      this.#sesion.aplicar({ tipo: "accion", agente, herramienta: p.tool_name, args, ts });
    },

    PostToolUse(p, ts) {
      const respuesta = p.tool_response ?? {};
      if (DELEGACION.has(p.tool_name)) {
        const agente = this.#porLlamada.get(p.tool_use_id) ?? this.#pila.at(-1) ?? "subagente";
        const i = this.#pila.lastIndexOf(agente);
        if (i >= 0) this.#pila.splice(i, 1);
        const declarado = respuesta.totalTokens ?? sumarUso(respuesta.usage);
        if (declarado) this.#declarar(agente, declarado);
        const texto = textoDe(respuesta);
        const enSegundoPlano =
          respuesta.status === "async_launched" ||
          respuesta.isAsync ||
          (texto.length < 400 && LANZADO_EN_SEGUNDO_PLANO.test(texto));
        if (!enSegundoPlano) this.#sesion.aplicar({ tipo: "entregar", de: agente, texto, ts });
        return;
      }
      if (p.tool_name === "Bash") {
        const salida = `${respuesta.stdout ?? ""}${respuesta.stderr ?? ""}`;
        this.#sesion.aplicar({ tipo: "resultado", agente: this.#agenteActual(p), salida, ts });
      }
    },

    SubagentStop(p, ts) {
      const agente = p.agent_type ?? this.#pila.at(-1);
      if (agente && this.#sesion.estado(agente) === "trabajando") {
        this.#sesion.aplicar({ tipo: "entregar", de: agente, texto: p.last_assistant_message ?? "", ts });
      }
    },

    Stop(_, ts) {
      this.#sesion.aplicar({ tipo: "turno-fin", ts });
    },
  };

  #reiniciar(ts) {
    this.#pila = [];
    this.#porLlamada.clear();
    this.#transcriptDe.clear();
    this.#tokensPorTranscript.clear();
    this.#tokensDeclarados.clear();
    this.#principal = null;
    this.#sesion.aplicar({ tipo: "inicio", ts });
  }

  #fijarPrincipal(ruta) {
    if (!ruta) return;
    this.#principal = ruta;
    this.#transcriptDe.set(ruta, ORQUESTADOR);
  }

  #agenteActual(p) {
    if (p.agent_type) return p.agent_type;
    if (this.#pila.length) return this.#pila.at(-1);
    return this.#transcriptDe.get(p.transcript_path) ?? ORQUESTADOR;
  }

  #agenteDelInforme(texto = "") {
    const explicito = /(?:subagent|agent)[_ ]?type["':\s=]+([\w-]+)/i.exec(texto);
    if (explicito) return explicito[1];
    const trabajando = this.#sesion.agentesTrabajando();
    const nombrado = this.#agentesConocidos.find(
      (a) => trabajando.includes(a) && new RegExp(`\\b${a}\\b`, "i").test(texto.slice(0, 600)),
    );
    return nombrado ?? (trabajando.length === 1 ? trabajando[0] : null);
  }

  #limpiarInforme(texto = "") {
    return texto
      .replace(/^[\s\S]*?(final report[^:]*:|<result>)/i, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 200);
  }

  #declarar(agente, total) {
    this.#tokensDeclarados.set(agente, Math.max(this.#tokensDeclarados.get(agente) ?? 0, total));
  }

  #publicarTokens(ts) {
    const porAgente = new Map();
    for (const [ruta, total] of this.#tokensPorTranscript) {
      const agente = this.#transcriptDe.get(ruta) ?? ORQUESTADOR;
      porAgente.set(agente, (porAgente.get(agente) ?? 0) + total);
    }
    for (const [agente, total] of this.#tokensDeclarados)
      porAgente.set(agente, Math.max(porAgente.get(agente) ?? 0, total));
    if (porAgente.size) this.#sesion.aplicar({ tipo: "tokens", porAgente: Object.fromEntries(porAgente), ts });
  }
}
