import { join } from "node:path";
import { cargarConfig, RAIZ } from "./config.js";
import { Difusor } from "./core/difusor.js";
import { Clasificador } from "./core/clasificador.js";
import { Sesion } from "./core/sesion.js";
import { AdaptadorClaude } from "./adaptadores/claude.js";
import { MonitorGitHub } from "./servicios/github.js";
import { Demo } from "./servicios/demo.js";
import { crearServidor } from "./http/servidor.js";

const config = cargarConfig();
const difusor = new Difusor();
const sesion = new Sesion(difusor, new Clasificador(config.repos));
const claude = new AdaptadorClaude(sesion, config.orden);
const github = new MonitorGitHub(config.repos, difusor);
const demo = new Demo(sesion, join(RAIZ, "datos", "demo.json"));

const servidor = crearServidor({ config, difusor, sesion, claude, github, demo, carpetaPublica: join(RAIZ, "public") });

servidor.on("error", (error) => {
  if (error.code === "EADDRINUSE")
    console.error(`El puerto ${config.puerto} está ocupado. Prueba: PORT=4600 npm start`);
  else console.error(error.message);
  process.exit(1);
});

servidor.listen(config.puerto, () => {
  console.log(`Visor de agentes en http://localhost:${config.puerto}`);
  if (github.activo)
    console.log(
      `GitHub: ${config.repos
        .filter((r) => r.github)
        .map((r) => r.github)
        .join(", ")}`,
    );
  github.iniciar();
});
