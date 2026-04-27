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

// ✅ 1. CONFIGURACIÓN DE LÍMITES - DEBE IR PRIMERO
app.use(express.json({ limit: '50gb' }));
app.use(express.urlencoded({ extended: true, limit: '50gb' }));

// ✅ 2. CORS
app.use(cors());

// ✅ 3. INICIAR CRON (después de middlewares básicos)
startOptimizationCron();

// ✅ 4. FILE UPLOAD - Configuración OPTIMIZADA para archivos grandes
app.use(fileUpload({
    limits: { 
        fileSize: 50 * 1024 * 1024 * 1024, // 50GB
        fieldSize: 50 * 1024 * 1024 * 1024  // También para campos de texto
    },
    useTempFiles: true,        // Usar disco en lugar de RAM
    tempFileDir: '/tmp/',      // Directorio temporal
    debug: true,               // 🔥 CAMBIAR A TRUE para ver logs
    abortOnLimit: true,        // Rechazar archivos que excedan el límite
    parseNested: true,         // Parsear campos anidados
    preserveExtension: true,   // Mantener extensión original
    safeFileNames: true,       // Nombres seguros
    uriDecodeFileNames: true   // Decodificar nombres URI
}));

// ✅ 5. MIDDLEWARE DE DIAGNÓSTICO (TEMPORAL - para debug)
app.use('/upload-video', (req, res, next) => {
    console.log('📊 [DIAGNÓSTICO] Solicitud a /upload-video');
    console.log('  - Método:', req.method);
    console.log('  - Content-Type:', req.headers['content-type']);
    console.log('  - Content-Length:', req.headers['content-length'] ? 
        `${(parseInt(req.headers['content-length']) / (1024*1024)).toFixed(2)} MB` : 'No especificado');
    console.log('  - req.body existe?', !!req.body);
    console.log('  - req.files existe?', !!req.files);
    
    // Verificar si es multipart
    if (req.headers['content-type']?.includes('multipart/form-data')) {
        console.log('  ✅ Tipo multipart detectado');
    } else {
        console.log('  ⚠️ No es multipart/form-data');
    }
    
    next();
});

// ✅ 6. MANEJADOR DE ERRORES PARA ARCHIVOS GRANDES
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

// ✅ 7. ARCHIVOS ESTÁTICOS
app.use("/", express.static("public"));

// ✅ 8. RUTAS
app.use(videoRouter);

// ✅ 9. INICIAR SERVIDOR CON TIMEOUTS AUMENTADOS
const server = app.listen(PORT, "0.0.0.0", () => {
    const ip = getLocalIP();
    console.log("------ SERVIDOR fastvideo ------");
    console.log(`Local:      http://localhost:${PORT}`);
    console.log(`Red:        http://${ip}:${PORT}`);
    console.log(`Nombre:     http://fastvideo.local:${PORT} 🌐`);
    console.log("---------------------------");
    console.log("📁 Configuración de archivos:");
    console.log(`  - Tamaño máximo: 50GB`);
    console.log(`  - Temp directory: /tmp/`);
    console.log(`  - Debug mode: ACTIVADO`);
});

// ✅ 10. AUMENTAR TIMEOUTS PARA ARCHIVOS GRANDES
server.headersTimeout = 3600000;  // 1 hora
server.requestTimeout = 3600000;  // 1 hora
server.keepAliveTimeout = 60000;  // 1 minuto

// ✅ 11. MANEJAR CIERRE GRACIOSO
process.on('SIGTERM', () => {
    console.log('🛑 Recibido SIGTERM, cerrando servidor...');
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