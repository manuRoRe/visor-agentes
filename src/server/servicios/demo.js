import { readFileSync } from "node:fs";

export class Demo {
  #sesion;
  #ruta;
  #temporizadores = [];

  constructor(sesion, ruta) {
    this.#sesion = sesion;
    this.#ruta = ruta;
  }

  reproducir() {
    this.detener();
    const guion = JSON.parse(readFileSync(this.#ruta, "utf8"));
    this.#sesion.aplicar({ tipo: "inicio" });
    let espera = 0;
    for (const { pausa = 900, ...evento } of guion) {
      espera += pausa;
      this.#temporizadores.push(setTimeout(() => this.#sesion.aplicar({ ...evento, ts: Date.now() }), espera));
    }
  }

  detener() {
    this.#temporizadores.forEach(clearTimeout);
    this.#temporizadores = [];
  }
}
