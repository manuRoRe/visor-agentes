export class Difusor {
  #clientes = new Set();
  #historial = [];
  #limite;

  constructor(limite = 2000) {
    this.#limite = limite;
  }

  conectar(res, { antes = [], despues = [] } = {}) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    for (const ev of [...antes, ...this.#historial, ...despues]) this.#escribir(res, ev);
    this.#clientes.add(res);
    res.on("close", () => this.#clientes.delete(res));
  }

  emitir(evento, { guardar = true } = {}) {
    const ev = { ts: Date.now(), ...evento };
    if (guardar) {
      this.#historial.push(ev);
      if (this.#historial.length > this.#limite) this.#historial = this.#historial.slice(-this.#limite);
    }
    for (const res of this.#clientes) this.#escribir(res, ev);
    return ev;
  }

  limpiar() {
    this.#historial = [];
  }

  #escribir(res, ev) {
    res.write(`data: ${JSON.stringify(ev)}\n\n`);
  }
}
