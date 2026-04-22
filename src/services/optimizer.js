import cron from 'node-cron';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import { mapDirectory } from './directoryMapper.js';
import { videoFolder } from '../utils/alias.js';

const DB_PATH = path.join(process.cwd(), 'processed_videos.json');

// --- PERSISTENCIA ---
async function getProcessedVideos() {
    try {
        const data = await fs.readFile(DB_PATH, 'utf-8');
        return JSON.parse(data);
    } catch { return []; }
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
        
        // Temporal único para evitar colisiones
        const tempPath = path.join(dir, `${baseName}_opt.tmp.mp4`);
        const finalPath = path.join(dir, `${baseName}.mp4`);

        ffmpeg.ffprobe(videoPath, (err, metadata) => {
            if (err) return reject(err);

            const vStream = metadata.streams.find(s => s.codec_type === 'video');
            const aStream = metadata.streams.find(s => s.codec_type === 'audio');

            // Criterios de Analista para el Centrino
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
                        '-level:v 4.0',      // Crucial para el Centrino
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

                            // --- MANIOBRA DE REEMPLAZO SEGURO ---
                            // Borramos el original (sea MKV o el MP4 pesado)
                            console.log(`   🗑️  Eliminando versión antigua...`);
                            await fs.unlink(pathOrig); 

                            // Renombramos el temporal al nombre final .mp4
                            console.log(`   ♻️  Estableciendo versión optimizada...`);
                            await fs.rename(tempPath, pathDest);
                            
                            await saveProcessed(pathDest);
                            console.log(`✅ [Optimizer] Finalizado con éxito: ${baseName}.mp4`);
                            resolve();
                        } catch (e) { 
                            console.error("❌ [Optimizer] Error en reemplazo de archivos:", e);
                            reject(e); 
                        }
                    })
                    .on('error', (e) => {
                        console.error(`❌ [Optimizer] Error de FFmpeg en ${baseName}:`, e.message);
                        reject(e);
                    })
                    .save(tempPath);
            } else {
                // Si ya es apto, lo registramos para no volver a analizarlo
                saveProcessed(videoPath).then(resolve);
            }
        });
    });
};

// --- NAVEGACIÓN RECURSIVA ---
async function ejecutarMantenimiento(currentPath, processedList) {
    const data = mapDirectory(currentPath);

    // Procesar videos de la carpeta actual uno por uno (Sequential)
    for (const video of data.videos) {
        const fullPath = path.resolve(path.join(currentPath, video.name));
        
        if (processedList.includes(fullPath)) {
            continue; // Ya procesado, saltar.
        }
        
        try {
            await optimizeVideo(fullPath);
        } catch (err) {
            console.error(`❌ [Optimizer] Falló el procesamiento de ${video.name}`);
        }
    }

    // Entrar en subcarpetas
    for (const folder of data.folders) {
        const nextPath = path.join(currentPath, folder.name);
        await ejecutarMantenimiento(nextPath, processedList);
    }
}

// --- EXPORTACIÓN DEL CRON ---
export const startOptimizationCron = () => {
    console.log("⏰ Cron de optimización nocturna programado (03:00 AM)");
    
    cron.schedule('0 3 * * *', async () => {
        console.log('🌙 [Cron] Iniciando mantenimiento de biblioteca...');
        
        if (!existsSync(videoFolder)) {
            console.error("❌ [Cron] Error: La carpeta de videos no existe.");
            return;
        }

        try {
            const processedList = await getProcessedVideos();
            await ejecutarMantenimiento(videoFolder, processedList);
            console.log('✅ [Cron] Mantenimiento nocturno finalizado.');
        } catch (err) {
            console.error("❌ [Cron] Error crítico durante el mantenimiento:", err);
        }
    });
};