import { App } from "./app.js";

const $ = (selector) => document.querySelector(selector);

const app = new App({
  titulo: $("#titulo"),
  orden: $("#orden"),
  tiempo: $("#tiempo"),
  acciones: $("#acciones"),
  tokens: $("#tokens"),
  estado: $("#estado"),
  escenario: $("#escenario"),
  aristas: $("#aristas"),
  paquetes: $("#paquetes"),
  feed: $("#feed"),
  repos: $("#repos"),
  github: $("#github"),
  final: $("#final"),
  finalValor: $("#finalV"),
  finalDetalle: $("#finalD"),
  finalComparacion: $("#finalCmp"),
});

const enviar = (ruta) => fetch(ruta, { method: "POST" });

$("#bDemo").addEventListener("click", () => enviar("/demo"));
$("#bReset").addEventListener("click", () => enviar("/reset"));
$("#bOlvidar").addEventListener("click", (e) => {
  app.olvidarPasadas();
  e.currentTarget.textContent = "Olvidadas ✓";
  setTimeout(() => ($("#bOlvidar").textContent = "Olvidar pasadas"), 1500);
});

const flujo = new EventSource("/stream");
flujo.onmessage = (mensaje) => {
  try {
    app.manejar(JSON.parse(mensaje.data));
  } catch (error) {
    console.error(error);
  }
};
