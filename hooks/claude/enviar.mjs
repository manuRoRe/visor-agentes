#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";

const VISOR_URL = process.env.VISOR_URL ?? "http://localhost:4545/api/claude";
const TIEMPO_MAXIMO_MS = 800;

function leerEntrada() {
  try {
    return JSON.parse(readFileSync(0, "utf8") || "{}");
  } catch {
    return null;
  }
}

function tokensDeTranscript(ruta) {
  if (!ruta || !existsSync(ruta)) return null;
  const vistos = new Set();
  const total = { input: 0, output: 0, cache_read: 0, cache_write: 0 };
  let lineas;
  try {
    lineas = readFileSync(ruta, "utf8").split("\n");
  } catch {
    return null;
  }
  for (const linea of lineas) {
    if (!linea.includes('"usage"')) continue;
    let entrada;
    try {
      entrada = JSON.parse(linea);
    } catch {
      continue;
    }
    const mensaje = entrada.message;
    if (!mensaje?.usage) continue;
    const id = mensaje.id ?? entrada.uuid;
    if (id && vistos.has(id)) continue;
    if (id) vistos.add(id);
    total.input += mensaje.usage.input_tokens ?? 0;
    total.output += mensaje.usage.output_tokens ?? 0;
    total.cache_read += mensaje.usage.cache_read_input_tokens ?? 0;
    total.cache_write += mensaje.usage.cache_creation_input_tokens ?? 0;
  }
  return total;
}

async function enviar(cuerpo) {
  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), TIEMPO_MAXIMO_MS);
  try {
    await fetch(VISOR_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
      signal: control.signal,
    });
  } catch {
    return;
  } finally {
    clearTimeout(temporizador);
  }
}

const payload = leerEntrada();
if (payload) {
  await enviar({
    ts: Date.now(),
    event: payload.hook_event_name ?? "Unknown",
    payload,
    tokens: tokensDeTranscript(payload.transcript_path),
    tokensAgente: payload.agent_transcript_path ? tokensDeTranscript(payload.agent_transcript_path) : null,
  });
}
process.exit(0);
