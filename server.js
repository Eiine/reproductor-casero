import express from "express";
import path from "path";
import os from "os";
import fileUpload from "express-fileupload"; // ✅ Importante
import videoRouter from "./src/router/videoRouter.js";
import cors from "cors";
import { Bonjour } from "bonjour-service";
import { startOptimizationCron } from './src/services/optimizer.js';

const PORT = 3000;
const app = express();
startOptimizationCron();
// ✅ Middlewares básicos (FALTABAN ESTOS)
app.use(cors());
app.use(express.json()); // Para parsear JSON
app.use(express.urlencoded({ extended: true })); // Para parsear formularios

// ✅ Middleware para subida de archivos (EL MÁS IMPORTANTE)
app.use(fileUpload({
    limits: { fileSize: 50 * 1024 * 1024 * 1024 }, // 50GB máximo
    useTempFiles: true,
    tempFileDir: '/tmp/',
    debug: false // Cambia a true si quieres ver logs detallados
}));

const bonjour = new Bonjour();

bonjour.publish({
  name: "fastvideo",
  type: "http",
  port: PORT,
  host: getLocalIP()
});

function getLocalIP() {
  const interfaces = os.networkInterfaces();

  let fallback = null;

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family !== "IPv4" || iface.internal) continue;

      const ip = iface.address;

      // ignorar rangos típicos virtuales
      if (
        ip.startsWith("192.168.56.") || // VirtualBox
        ip.startsWith("172.17.") ||     // Docker
        ip.startsWith("169.254.")       // APIPA
      ) {
        continue;
      }

      // priorizar red local típica
      if (
        ip.startsWith("192.168.") ||
        ip.startsWith("10.") ||
        ip.startsWith("172.16.") ||
        ip.startsWith("172.31.")
      ) {
        return ip;
      }

      // fallback si no hay mejor opción
      if (!fallback) fallback = ip;
    }
  }

  return fallback || "localhost";
}

// ✅ Archivos estáticos
app.use("/", express.static("public"));

// ✅ Rutas (DEBE IR DESPUÉS de los middlewares)
app.use(videoRouter);

app.listen(PORT, "0.0.0.0", () => {
  const ip = getLocalIP();
  console.log("------ SERVIDOR fastvideo ------");
  console.log(`Local:      http://localhost:${PORT}`);
  console.log(`Red:        http://${ip}:${PORT}`);
  console.log(`Nombre:     http://fastvideo.local:${PORT} 🌐`);
  console.log("---------------------------");
});