import express from "express";
import path from "path";
import os from "os";
import fileUpload from "express-fileupload";
import videoRouter from "./src/router/videoRouter.js";
import cors from "cors";
import { Bonjour } from "bonjour-service";
import { startOptimizationCron } from './src/services/optimizer.js';

const PORT = 3000;
const app = express();

// ✅ 1. CONFIGURACIÓN DE LÍMITES GLOBALES
app.use(express.json({ limit: '50gb' }));
app.use(express.urlencoded({ extended: true, limit: '50gb' }));

// ✅ 2. CORS
app.use(cors());

// ✅ 3. INICIAR CRON
startOptimizationCron();

// ✅ 4. FILE UPLOAD - Configuración global para archivos grandes
app.use(fileUpload({
    limits: { 
        fileSize: 50 * 1024 * 1024 * 1024, // 50GB
        fieldSize: 50 * 1024 * 1024 * 1024
    },
    useTempFiles: true,
    tempFileDir: '/tmp/',
    debug: false,  // Cambia a true solo para debug
    abortOnLimit: true,
    parseNested: true,
    preserveExtension: true,
    safeFileNames: true,
    uriDecodeFileNames: true
}));

// ✅ 5. MANEJADOR DE ERRORES GLOBAL
app.use((err, req, res, next) => {
    if (err.code === 'LIMIT_FILE_SIZE') {
        console.error('❌ Archivo excede el límite de 50GB');
        return res.status(413).json({ 
            error: 'El archivo es demasiado grande. Máximo permitido: 50GB' 
        });
    }
    if (err.message === 'request entity too large') {
        console.error('❌ Solicitud demasiado grande');
        return res.status(413).json({ 
            error: 'La solicitud excede el límite de tamaño' 
        });
    }
    next(err);
});

// ✅ 6. ARCHIVOS ESTÁTICOS
app.use("/", express.static("public"));

// ✅ 7. RUTAS (TODO LA LÓGICA ESTÁ EN EL CONTROLLER)
app.use(videoRouter);

// ✅ 8. INICIAR SERVIDOR
const server = app.listen(PORT, "0.0.0.0", () => {
    const ip = getLocalIP();
    console.log("------ SERVIDOR fastvideo ------");
    console.log(`Local:      http://localhost:${PORT}`);
    console.log(`Red:        http://${ip}:${PORT}`);
    console.log(`Nombre:     http://fastvideo.local:${PORT} 🌐`);
    console.log("---------------------------");
    console.log("📁 Configuración:");
    console.log(`  - Tamaño máximo: 50GB`);
    console.log(`  - Directorio temp: /tmp/`);
});

// ✅ 9. TIMEOUTS PARA ARCHIVOS GRANDES
server.headersTimeout = 3600000;  // 1 hora
server.requestTimeout = 3600000;  // 1 hora
server.keepAliveTimeout = 60000;

// ✅ 10. CIERRE GRACIOSO
process.on('SIGTERM', () => {
    console.log('🛑 Cerrando servidor...');
    server.close(() => {
        console.log('✅ Servidor cerrado');
        process.exit(0);
    });
});

function getLocalIP() {
    const interfaces = os.networkInterfaces();
    let fallback = null;

    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family !== "IPv4" || iface.internal) continue;

            const ip = iface.address;

            if (
                ip.startsWith("192.168.56.") ||
                ip.startsWith("172.17.") ||
                ip.startsWith("169.254.")
            ) {
                continue;
            }

            if (
                ip.startsWith("192.168.") ||
                ip.startsWith("10.") ||
                ip.startsWith("172.16.") ||
                ip.startsWith("172.31.")
            ) {
                return ip;
            }

            if (!fallback) fallback = ip;
        }
    }

    return fallback || "localhost";
}