// URL del visor: cámbiala si el visor corre en otro puerto u ordenador (o usa la variable VISOR_URL).
const VISOR_URL = process.env.VISOR_URL ?? "http://localhost:4545/api/eventos";

const ORQUESTADOR = "orquestador";
const DELEGACION = new Set(["task", "subagent"]);

let cola = Promise.resolve();

const enviar = (evento) => {
  const cuerpo = JSON.stringify({ ...evento, ts: Date.now() });
  cola = cola
    .then(() => fetch(VISOR_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: cuerpo }))
    .catch(() => {});
  return cola;
};

const nombreDelegado = (args = {}) => args.subagent_type ?? args.agent ?? args.subagent ?? args.name ?? "subagente";

const limpiarOrden = (texto = "") => texto.trim().replace(/^"([\s\S]*)"$/, "$1");

const limpiarInforme = (texto = "") => {
  const resultado = /<task_result>([\s\S]*?)<\/task_result>/.exec(texto);
  return (resultado ? resultado[1] : texto)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
};

const sumarTokens = (t = {}) =>
  (t.input ?? 0) + (t.output ?? 0) + (t.reasoning ?? 0) + (t.cache?.read ?? 0) + (t.cache?.write ?? 0);

export const VisorAgentes = async () => {
  let raiz = null;
  const agenteDeSesion = new Map();
  const pendientes = [];
  const delegadoPorLlamada = new Map();
  const rolDeMensaje = new Map();
  const textoPendiente = new Map();
  const tokensPorMensaje = new Map();
  const ordenesEnviadas = new Set();

  const agenteDe = (sesion) => agenteDeSesion.get(sesion) ?? ORQUESTADOR;

  const enviarOrden = (mensaje, texto) => {
    if (!texto || ordenesEnviadas.has(mensaje)) return;
    ordenesEnviadas.add(mensaje);
    enviar({ tipo: "orden", texto: limpiarOrden(texto) });
  };

  const tokensPorAgente = () => {
    const porAgente = {};
    for (const { agente, total } of tokensPorMensaje.values()) porAgente[agente] = (porAgente[agente] ?? 0) + total;
    return porAgente;
  };

  let temporizadorTokens = null;
  const publicarTokens = () => {
    clearTimeout(temporizadorTokens);
    temporizadorTokens = setTimeout(() => enviar({ tipo: "tokens", porAgente: tokensPorAgente() }), 250);
  };

  const eventos = {
    "session.created": ({ info = {} }) => {
      if (!info.parentID) {
        raiz = info.id;
        agenteDeSesion.clear();
        agenteDeSesion.set(info.id, ORQUESTADOR);
        tokensPorMensaje.clear();
        enviar({ tipo: "inicio" });
        return;
      }
      agenteDeSesion.set(info.id, pendientes.shift() ?? info.title ?? "subagente");
    },

    "message.updated": ({ info = {} }) => {
      rolDeMensaje.set(info.id, info.role);
      if (info.role === "user" && info.sessionID === raiz && textoPendiente.has(info.id)) {
        enviarOrden(info.id, textoPendiente.get(info.id));
        textoPendiente.delete(info.id);
      }
      if (info.role === "assistant" && info.tokens) {
        tokensPorMensaje.set(info.id, { agente: agenteDe(info.sessionID), total: sumarTokens(info.tokens) });
        publicarTokens();
      }
    },

    "message.part.updated": ({ part = {} }) => {
      if (part.type !== "text" || part.synthetic || part.sessionID !== raiz) return;
      const rol = rolDeMensaje.get(part.messageID);
      if (rol === "user") enviarOrden(part.messageID, part.text);
      else if (rol === undefined) textoPendiente.set(part.messageID, part.text);
    },

    "session.idle": ({ sessionID }) => {
      if (sessionID !== raiz) return;
      clearTimeout(temporizadorTokens);
      enviar({ tipo: "tokens", porAgente: tokensPorAgente() });
      enviar({ tipo: "turno-fin" });
    },
  };

  return {
    "tool.execute.before": async (input, output) => {
      const agente = agenteDe(input.sessionID);
      const args = output?.args ?? {};
      if (DELEGACION.has(input.tool)) {
        const delegado = nombreDelegado(args);
        pendientes.push(delegado);
        delegadoPorLlamada.set(input.callID, delegado);
        enviar({ tipo: "delegar", de: agente, a: delegado, texto: args.description ?? args.prompt ?? "" });
        return;
      }
      enviar({ tipo: "accion", agente, herramienta: input.tool, args });
    },

    "tool.execute.after": async (input, output) => {
      if (DELEGACION.has(input.tool)) {
        const delegado = delegadoPorLlamada.get(input.callID) ?? "subagente";
        enviar({
          tipo: "entregar",
          de: delegado,
          a: agenteDe(input.sessionID),
          texto: limpiarInforme(String(output?.output ?? output?.title ?? "")),
        });
        return;
      }
      if (input.tool === "bash")
        enviar({ tipo: "resultado", agente: agenteDe(input.sessionID), salida: String(output?.output ?? "") });
    },

    event: async ({ event }) => {
      eventos[event.type]?.(event.properties ?? {});
    },
  };
};
