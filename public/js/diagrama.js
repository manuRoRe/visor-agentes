import { ORQUESTADOR, GITHUB } from "./catalogo.js";
import { tokens as formatearTokens, recortar } from "./formato.js";

const NS = "http://www.w3.org/2000/svg";
const ETIQUETAS = { trabajando: "trabajando", hecho: "hecho", esperando: "esperando" };

export class Diagrama {
  #escenario;
  #capaAristas;
  #capaPaquetes;
  #catalogo;
  #nodos = new Map();
  #aristas = new Map();

  constructor({ escenario, capaAristas, capaPaquetes, catalogo }) {
    this.#escenario = escenario;
    this.#capaAristas = capaAristas;
    this.#capaPaquetes = capaPaquetes;
    this.#catalogo = catalogo;
    window.addEventListener("resize", () => this.disponer());
  }

  reiniciar() {
    for (const nodo of this.#nodos.values()) nodo.el.remove();
    this.#nodos.clear();
    this.#aristas.clear();
    this.#capaAristas.replaceChildren();
    this.#capaPaquetes.replaceChildren();
    this.nodo(ORQUESTADOR);
    for (const id of this.#catalogo.orden) this.nodo(id);
    for (const repo of this.#catalogo.repos) this.nodo(repo.id);
    this.nodo(GITHUB);
  }

  nodo(id) {
    if (this.#nodos.has(id)) return this.#nodos.get(id);
    this.#catalogo.registrar(id);
    const recurso = this.#catalogo.esRecurso(id);
    const info = this.#catalogo.info(id);
    const el = document.createElement("div");
    el.className = ["nodo", recurso && "recurso", id === ORQUESTADOR && "hub"].filter(Boolean).join(" ");
    el.style.setProperty("--c", info.color);
    el.innerHTML = recurso
      ? `<div class="cab"><span class="luz"></span><span class="nombre"></span></div><p class="rol"></p>`
      : `<div class="cab"><span class="luz"></span><span class="nombre"></span></div>
         <div class="sub"><p class="rol"></p><span class="estadotxt">en espera</span></div>
         <div class="datos"><span><b class="nAcc">0</b> acc.</span><span><b class="nTok">0</b> tok</span></div>
         <p class="ultima"></p>`;
    const posicion = this.#catalogo.cadena.indexOf(id);
    el.querySelector(".nombre").textContent = posicion >= 0 ? `${posicion + 1} · ${info.nombre}` : info.nombre;
    el.querySelector(".rol").textContent = info.rol;
    this.#escenario.appendChild(el);
    const nodo = { el, recurso, acciones: 0, color: info.color };
    this.#nodos.set(id, nodo);
    this.disponer();
    return nodo;
  }

  estado(id, estado) {
    const { el } = this.nodo(id);
    el.classList.toggle("trabajando", estado === "trabajando");
    el.classList.toggle("hecho", estado === "hecho");
    const etiqueta = el.querySelector(".estadotxt");
    if (etiqueta) etiqueta.textContent = ETIQUETAS[estado] ?? "en espera";
  }

  trabajando(id) {
    return this.nodo(id).el.classList.contains("trabajando");
  }

  accion(id, texto, destino) {
    const nodo = this.nodo(id);
    if (!this.trabajando(id)) this.estado(id, "trabajando");
    nodo.acciones += 1;
    nodo.el.querySelector(".nAcc").textContent = nodo.acciones;
    nodo.el.querySelector(".ultima").textContent = texto;
    if (!destino) return;
    this.nodo(destino);
    const arista = this.#arista(`rep:${id}>${destino}`, id, destino, "repo usada");
    this.#encender(arista, nodo.color, 900);
    this.#viajar(arista, nodo.color, false, 600);
    const { el } = this.#nodos.get(destino);
    el.classList.remove("pulso");
    void el.offsetWidth;
    el.classList.add("pulso");
  }

  traspaso({ de, a, texto, vuelta }) {
    this.nodo(de);
    this.nodo(a);
    const agente = de === ORQUESTADOR ? a : de;
    const color = this.#catalogo.info(agente).color;
    const arista = this.#arista(`orq:${agente}`, ORQUESTADOR, agente, "orq");
    this.#encender(arista, color, 2000);
    this.#viajar(arista, color, Boolean(vuelta) || de !== ORQUESTADOR);
    if (de === ORQUESTADOR) {
      const cadena = this.#catalogo.cadena;
      const anterior = cadena[cadena.indexOf(agente) - 1];
      const tramo = anterior && this.#aristas.get(`cad:${anterior}>${agente}`);
      if (tramo) this.#encender(tramo, color, 2500);
    }
    this.#burbuja(de, a, texto);
  }

  tokens(porAgente = {}) {
    for (const [id, n] of Object.entries(porAgente)) {
      const etiqueta = n && this.#nodos.get(id)?.el.querySelector(".nTok");
      if (etiqueta) etiqueta.textContent = formatearTokens(n);
    }
  }

  agentesUsados() {
    return [...this.#nodos.values()].filter((n) => !n.recurso && (n.acciones > 0 || n.el.classList.contains("hecho")))
      .length;
  }

  disponer() {
    const W = this.#escenario.clientWidth;
    const H = this.#escenario.clientHeight;
    const ancho = Math.min(230, Math.max(170, W * 0.14));
    const colocar = (id, cx, cy) => {
      const { el } = this.#nodos.get(id);
      el.style.width = `${ancho}px`;
      el.style.left = `${Math.round(cx - ancho / 2)}px`;
      el.style.top = `${Math.round(cy - el.offsetHeight / 2)}px`;
    };

    if (this.#nodos.has(ORQUESTADOR)) colocar(ORQUESTADOR, W * 0.1, H * 0.5);

    const cadena = this.#catalogo.cadena.filter((id) => this.#nodos.has(id));
    const columnas = Math.max(1, Math.ceil(cadena.length / 2));
    const x = (c) => (columnas === 1 ? W * 0.5 : W * 0.31 + (W * 0.39 * c) / (columnas - 1));
    cadena.forEach((id, i) => {
      const arriba = i < columnas;
      colocar(id, x(arriba ? i : columnas - 1 - (i - columnas)), H * (arriba ? 0.2 : 0.8));
    });

    const recursos = [...this.#catalogo.repos.map((r) => r.id), GITHUB].filter((id) => this.#nodos.has(id));
    recursos.forEach((id, i) => {
      const y = recursos.length === 1 ? 0.5 : 0.2 + (0.6 * i) / (recursos.length - 1);
      colocar(id, W * 0.9, H * y);
    });

    requestAnimationFrame(() => this.#dibujarAristas());
  }

  #dibujarAristas() {
    const cadena = this.#catalogo.cadena;
    for (let i = 1; i < cadena.length; i++)
      this.#arista(`cad:${cadena[i - 1]}>${cadena[i]}`, cadena[i - 1], cadena[i], "cadena");
    for (const id of cadena) this.#arista(`orq:${id}`, ORQUESTADOR, id, "orq");
    for (const [clave, path] of this.#aristas) {
      if (this.#nodos.has(path.dataset.de) && this.#nodos.has(path.dataset.a))
        path.setAttribute("d", this.#ruta(clave, path.dataset.de, path.dataset.a));
    }
  }

  #arista(clave, de, a, clase) {
    let path = this.#aristas.get(clave);
    if (!path) {
      path = document.createElementNS(NS, "path");
      path.setAttribute("class", `arista ${clase}`);
      if (clase === "cadena") path.setAttribute("marker-end", "url(#flecha)");
      path.dataset.de = de;
      path.dataset.a = a;
      this.#capaAristas.appendChild(path);
      this.#aristas.set(clave, path);
    }
    if (this.#nodos.has(de) && this.#nodos.has(a)) path.setAttribute("d", this.#ruta(clave, de, a));
    return path;
  }

  #caja(id) {
    const { el } = this.#nodos.get(id);
    const x = parseFloat(el.style.left);
    const y = parseFloat(el.style.top);
    return { x, y, w: el.offsetWidth, h: el.offsetHeight, cx: x + el.offsetWidth / 2, cy: y + el.offsetHeight / 2 };
  }

  #borde(caja, px, py, margen = 4) {
    const dx = px - caja.cx;
    const dy = py - caja.cy;
    if (!dx && !dy) return { x: caja.cx, y: caja.cy };
    const escala = Math.min((caja.w / 2 + margen) / Math.abs(dx || 1e-9), (caja.h / 2 + margen) / Math.abs(dy || 1e-9));
    return { x: caja.cx + dx * escala, y: caja.cy + dy * escala };
  }

  #ruta(clave, de, a) {
    const A = this.#caja(de);
    const B = this.#caja(a);
    if (clave.startsWith("orq:")) {
      const inicio = { x: A.x + A.w + 4, y: A.cy };
      const fin = { x: B.cx, y: B.cy < A.cy ? B.y + B.h + 6 : B.y - 6 };
      return `M ${inicio.x} ${inicio.y} C ${inicio.x + 60} ${inicio.y}, ${fin.x} ${A.cy}, ${fin.x} ${fin.y}`;
    }
    const p1 = this.#borde(A, B.cx, B.cy);
    const p2 = this.#borde(B, A.cx, A.cy, 8);
    if (clave.startsWith("cad:")) return `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`;
    const mx = (p1.x + p2.x) / 2 - (p2.y - p1.y) * 0.18;
    const my = (p1.y + p2.y) / 2 + (p2.x - p1.x) * 0.18;
    return `M ${p1.x} ${p1.y} Q ${mx} ${my} ${p2.x} ${p2.y}`;
  }

  #encender(path, color, ms = 1600) {
    path.style.setProperty("--c", color);
    path.classList.add("activa");
    clearTimeout(path.temporizador);
    path.temporizador = setTimeout(() => {
      path.classList.remove("activa");
      path.classList.add("pasada");
    }, ms);
  }

  #viajar(path, color, invertido = false, duracion = 900) {
    const largo = path.getTotalLength();
    const punto = document.createElementNS(NS, "circle");
    punto.setAttribute("r", 7);
    punto.setAttribute("fill", color);
    punto.setAttribute("class", "paquete");
    punto.style.color = color;
    this.#capaPaquetes.appendChild(punto);
    const t0 = performance.now();
    const paso = (t) => {
      const k = Math.min(1, (t - t0) / duracion);
      const suave = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      const p = path.getPointAtLength((invertido ? 1 - suave : suave) * largo);
      punto.setAttribute("cx", p.x);
      punto.setAttribute("cy", p.y);
      if (k < 1) requestAnimationFrame(paso);
      else punto.remove();
    };
    requestAnimationFrame(paso);
  }

  #burbuja(de, a, texto) {
    if (!texto) return;
    const agente = a === ORQUESTADOR ? de : a;
    const caja = this.#caja(agente);
    const b = document.createElement("div");
    b.className = "burbuja";
    b.style.setProperty("--c", this.#catalogo.info(agente).color);
    b.innerHTML = `<span class="de"></span><span class="tx"></span>`;
    b.querySelector(".de").textContent = `${this.#catalogo.info(de).nombre} → ${this.#catalogo.info(a).nombre}`;
    b.querySelector(".tx").textContent = recortar(texto);
    this.#escenario.appendChild(b);
    const H = this.#escenario.clientHeight;
    b.style.left = `${Math.min(this.#escenario.clientWidth - 330, Math.max(0, caja.cx - 160))}px`;
    b.style.top = `${caja.cy < H / 2 ? caja.y + caja.h + 14 : Math.max(0, caja.y - 74)}px`;
    setTimeout(() => b.remove(), 4300);
  }
}
