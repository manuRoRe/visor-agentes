import { duracion, tokens as formatearTokens } from "./formato.js";

const ESTADOS = {
  espera: ["En espera", ""],
  trabajando: ["Trabajando", "var(--cian)"],
  esperando: ["Esperando agentes", "var(--amarillo)"],
  terminado: ["Terminado", "var(--verde)"],
};

export class Marcador {
  #dom;
  #inicio = null;
  #reloj = null;
  #acciones = 0;
  #tokens = 0;
  #mostrados = 0;
  #terminado = false;

  constructor(dom) {
    this.#dom = dom;
    dom.final.addEventListener("click", () => this.ocultarFinal());
  }

  get acciones() {
    return this.#acciones;
  }

  get tokens() {
    return this.#tokens;
  }

  get transcurrido() {
    return this.#inicio ? Date.now() - this.#inicio : 0;
  }

  reiniciar() {
    this.#detenerReloj();
    this.#inicio = null;
    this.#acciones = 0;
    this.#tokens = 0;
    this.#mostrados = 0;
    this.#terminado = false;
    this.#dom.tiempo.textContent = "00:00";
    this.#dom.acciones.textContent = "0";
    this.#dom.tokens.textContent = "0";
    this.#dom.orden.textContent = "Esperando una orden…";
    this.estado("espera");
    this.ocultarFinal();
  }

  orden(html) {
    this.#dom.orden.innerHTML = html;
  }

  actividad(ts = Date.now()) {
    if (!this.#inicio) this.#inicio = ts;
    if (this.#terminado) {
      this.#terminado = false;
      this.ocultarFinal();
    }
    this.estado("trabajando");
    if (!this.#reloj)
      this.#reloj = setInterval(() => (this.#dom.tiempo.textContent = duracion(Date.now() - this.#inicio)), 250);
  }

  sumarAccion() {
    this.#acciones += 1;
    this.#dom.acciones.textContent = this.#acciones;
  }

  fijarTokens(total) {
    this.#tokens = total;
    this.#animarTokens();
  }

  estado(clave) {
    const [texto, color] = ESTADOS[clave];
    this.#dom.estado.textContent = texto;
    this.#dom.estado.style.color = color;
  }

  terminar(ts, resumen, comparacion) {
    this.#terminado = true;
    this.#detenerReloj();
    if (this.#inicio) this.#dom.tiempo.textContent = duracion(ts - this.#inicio);
    this.#mostrados = this.#tokens;
    this.#dom.tokens.textContent = formatearTokens(this.#tokens);
    this.estado("terminado");
    this.#dom.finalValor.textContent = `${this.#dom.tiempo.textContent} · ${formatearTokens(this.#tokens)} tokens`;
    this.#dom.finalDetalle.textContent = resumen;
    this.#dom.finalComparacion.innerHTML = comparacion;
    setTimeout(() => this.#terminado && this.#dom.final.classList.add("ver"), 800);
  }

  ocultarFinal() {
    this.#dom.final.classList.remove("ver");
  }

  #detenerReloj() {
    clearInterval(this.#reloj);
    this.#reloj = null;
  }

  #animarTokens() {
    const paso = () => {
      const diferencia = this.#tokens - this.#mostrados;
      if (Math.abs(diferencia) < 1) {
        this.#mostrados = this.#tokens;
      } else {
        this.#mostrados += diferencia * 0.12;
        requestAnimationFrame(paso);
      }
      this.#dom.tokens.textContent = formatearTokens(this.#mostrados);
    };
    requestAnimationFrame(paso);
  }
}
