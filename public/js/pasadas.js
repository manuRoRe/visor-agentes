const CLAVE = "visorPasadas";
const MAXIMO = 10;

export class Pasadas {
  leer() {
    try {
      return JSON.parse(localStorage.getItem(CLAVE) ?? "[]");
    } catch {
      return [];
    }
  }

  ultima() {
    return this.leer().at(-1) ?? null;
  }

  guardar(pasada) {
    const lista = this.leer();
    const ultima = lista.at(-1);
    if (ultima && pasada.ts - ultima.ts < 5000) return;
    lista.push(pasada);
    try {
      localStorage.setItem(CLAVE, JSON.stringify(lista.slice(-MAXIMO)));
    } catch {
      return;
    }
  }

  olvidar() {
    try {
      localStorage.removeItem(CLAVE);
    } catch {
      return;
    }
  }
}
