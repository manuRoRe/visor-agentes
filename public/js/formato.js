export const tokens = (n) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(2)} M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)} k` : String(Math.round(n));

export const hora = (ts) => new Date(ts).toLocaleTimeString("es-ES", { hour12: false });

export const duracion = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

const ENTIDADES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
export const escapar = (texto = "") => String(texto).replace(/[&<>"]/g, (c) => ENTIDADES[c]);

export const recortar = (texto = "", max = 150) => (texto.length > max ? `${texto.slice(0, max - 1)}…` : texto);
