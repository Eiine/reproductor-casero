// videoOptimizer.js
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import { mapDirectory } from './directoryMapper.js';
import { videoFolder } from '../utils/alias.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 🔧 CONFIGURACIÓN PARA DOCKER: Forzamos el uso de los binarios globales del sistema
// Esto asegura compatibilidad total con tu Debian Slim y tu procesador Phenom 955
ffmpeg.setFfmpegPath('/usr/bin/ffmpeg');
ffmpeg.setFfprobePath('/usr/bin/ffprobe');

const DB_PATH = path.join(process.cwd(), 'processed_videos.json');
const MAX_PER_RUN = 10;  // Límite por ejecución

// --- PERSISTENCIA ---
async function getProcessedVideos() {
    try {
        const data = await fs.readFile(DB_PATH, 'utf-8');
        return JSON.parse(data);
    } catch {
        return [];
    }
}

async function saveProcessed(videoPath) {
    const list = await getProcessedVideos();
    const absPath = path.resolve(videoPath);

    if (!list.includes(absPath)) {
        list.push(absPath);
        await fs.writeFile(DB_PATH, JSON.stringify(list, null, 2));
    }
}

// --- CORE DE OPTIMIZACIÓN ---
const optimizeVideo = (videoPath) => {
    return new Promise((resolve, reject) => {
        const dir = path.dirname(videoPath);
        const ext = path.extname(videoPath);
        const baseName = path.basename(videoPath, ext);

        // Nombres de los archivos temporales y finales
        const tempPath = path.join(dir, `optimized_temp_${Date.now()}.mp4`);
        const finalPath = path.join(dir, `${baseName}.mp4`);

        ffmpeg.ffprobe(videoPath, (err, metadata) => {
            if (err) return reject(err);

            const vStream = metadata.streams.find(s => s.codec_type === 'video');
            const aStream = metadata.streams.find(s => s.codec_type === 'audio');

            const isMP4 = ext.toLowerCase() === '.mp4';
            const isH264 = vStream?.codec_name === 'h264';
            const isAAC = aStream?.codec_name === 'aac';
            const isLevelOk = vStream?.level <= 40;
            const isAudioOk = parseInt(aStream?.sample_rate) <= 44100;

            if (!isMP4 || !isH264 || !isAAC || !isLevelOk || !isAudioOk) {
                console.log(`🛠️  [Optimizer] Recodificando: ${baseName}${ext}`);

                ffmpeg(videoPath)
                    .outputOptions([
                        '-c:v libx264',
                        '-profile:v high',
                        '-level:v 4.0',
                        '-crf 23',
                        '-preset fast',
                        '-c:a aac',
                        '-ar 44100',
                        '-b:a 125k',
                        '-ac 2',
                        '-movflags +faststart'
                    ])
                    .on('end', async () => {
                        try {
                            const pathOrig = path.resolve(videoPath);
                            const pathDest = path.resolve(finalPath);

                            console.log(`   🗑️  Eliminando versión antigua...`);
                            await fs.unlink(pathOrig);

                            console.log(`   ♻️  Estableciendo versión optimizada...`);
                            await fs.rename(tempPath, pathDest);

                            await saveProcessed(pathDest);

                            console.log(`✅ [Optimizer] Finalizado: ${baseName}.mp4`);
                            resolve(true);
                        } catch (e) {
                            console.error("❌ Error en reemplazo:", e);
                            reject(e);
                        }
                    })
                    .on('error', async (e) => {
                        console.error(`❌ Error FFmpeg en ${baseName}:`, e.message);

                        try {
                            if (existsSync(tempPath)) {
                                await fs.unlink(tempPath);
                            }
                        } catch {}

                        reject(e);
                    })
                    .save(tempPath);
            } else {
                console.log(`✅ [Optimizer] Ya optimizado: ${baseName}${ext}`);
                saveProcessed(videoPath).then(() => resolve(false));
            }
        });
    });
};

// --- NAVEGACIÓN RECURSIVA CON LÍMITE ---
async function ejecutarMantenimiento(currentPath, processedList, state) {
    if (state.processedToday >= MAX_PER_RUN) return;

    const data = mapDirectory(currentPath);

    // 🎬 Videos
    for (const video of data.videos) {
        if (state.processedToday >= MAX_PER_RUN) return;

        const fullPath = path.resolve(path.join(currentPath, video.name));

        if (processedList.includes(fullPath)) {
            console.log(`⏭️  Saltando (ya procesado): ${video.name}`);
            continue;
        }

        try {
            const wasProcessed = await optimizeVideo(fullPath);

            if (wasProcessed) {
                state.processedToday++;
                console.log(`📊 Procesados en esta ejecución: ${state.processedToday}/${MAX_PER_RUN}`);
            }

        } catch (error) {
            console.error(`❌ Falló: ${video.name}`);
        }
    }

    // 📁 Subcarpetas
    for (const folder of data.folders) {
        if (state.processedToday >= MAX_PER_RUN) return;

        const nextPath = path.join(currentPath, folder.name);
        await ejecutarMantenimiento(nextPath, processedList, state);
    }
}

// --- FUNCIÓN PRINCIPAL ---
async function runOptimization(customPath = null) {
    const targetPath = customPath || videoFolder;
    
    console.log('\n🚀 Iniciando optimización manual');
    console.log(`📁 Directorio: ${targetPath}`);
    console.log(`🎯 Límite: ${MAX_PER_RUN} videos por ejecución\n`);

    if (!existsSync(targetPath)) {
        console.error("❌ Error: La carpeta no existe.");
        return false;
    }

    try {
        const processedList = await getProcessedVideos();
        const state = { processedToday: 0 };
        
        const startTime = Date.now();
        await ejecutarMantenimiento(targetPath, processedList, state);
        const endTime = Date.now();
        
        console.log('\n🏁 === RESUMEN ===');
        console.log(`✅ Videos procesados: ${state.processedToday}/${MAX_PER_RUN}`);
        console.log(`⏱️  Tiempo total: ${((endTime - startTime) / 1000).toFixed(2)} segundos`);
        
        return true;
        
    } catch (err) {
        console.error("❌ Error crítico:", err);
        return false;
    }
}

// --- RESET ---
async function resetProcessedVideos() {
    await fs.writeFile(DB_PATH, JSON.stringify([], null, 2));
    console.log("🗑️ Registro de videos procesados reiniciado");
}

// --- ESTADÍSTICAS ---
async function showStats() {
    const processed = await getProcessedVideos();
    console.log('\n📊 === ESTADÍSTICAS ===');
    console.log(`Total videos procesados históricos: ${processed.length}`);
    console.log(`Límite por ejecución: ${MAX_PER_RUN}`);
    console.log(`Archivo de registro: ${DB_PATH}`);
    
    if (processed.length > 0) {
        console.log(`\nÚltimos 5 videos procesados:`);
        processed.slice(-5).forEach((video, i) => {
            console.log(`  ${i+1}. ${path.basename(video)}`);
        });
    }
}

// --- MANEJO DE ARGUMENTOS DE TERMINAL ---
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    
    switch(command) {
        case 'reset':
            await resetProcessedVideos();
            break;
        case 'stats':
            await showStats();
            break;
        case 'help':
        case '--help':
        case '-h':
            console.log(`
📖 COMANDOS DISPONIBLES:
  node videoOptimizer.js          → Ejecuta optimización (carpeta por defecto)
  node videoOptimizer.js /ruta    → Optimiza una carpeta específica
  node videoOptimizer.js stats    → Muestra estadísticas
  node videoOptimizer.js reset     → Reinicia el registro de videos
  node videoOptimizer.js help      → Muestra esta ayuda
            `);
            break;
        default:
            // Si hay un argumento que no es comando, asumimos que es una ruta
            const targetPath = command && !command.startsWith('-') ? command : null;
            await runOptimization(targetPath);
            break;
    }
}

// Ejecutar si se llama directamente desde terminal
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}

// Exportar funciones por si alguien quiere usarlas desde otro script
export { runOptimization, resetProcessedVideos, showStats as getStats };