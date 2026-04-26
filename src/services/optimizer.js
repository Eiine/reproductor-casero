import cron from 'node-cron';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import { mapDirectory } from './directoryMapper.js';
import { videoFolder } from '../utils/alias.js';

const DB_PATH = path.join(process.cwd(), 'processed_videos.json');

// 🔒 Límite por ejecución (por día)
const MAX_PER_RUN = 2;

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

        const tempPath = path.join(dir, `${baseName}_opt.tmp.mp4`);
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
                            resolve(true); // 🔥 indica que se procesó realmente
                        } catch (e) {
                            console.error("❌ Error en reemplazo:", e);
                            reject(e);
                        }
                    })
                    .on('error', async (e) => {
                        console.error(`❌ Error FFmpeg en ${baseName}:`, e.message);

                        // 🧹 limpiar temporal si falla
                        try {
                            if (existsSync(tempPath)) {
                                await fs.unlink(tempPath);
                            }
                        } catch {}

                        reject(e);
                    })
                    .save(tempPath);
            } else {
                // Ya está optimizado
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

        if (processedList.includes(fullPath)) continue;

        try {
            const wasProcessed = await optimizeVideo(fullPath);

            if (wasProcessed) {
                state.processedToday++;
                console.log(`📊 Procesados hoy: ${state.processedToday}/${MAX_PER_RUN}`);
            }

        } catch {
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

// --- CRON ---
export const startOptimizationCron = () => {
    console.log("⏰ Cron activo (máx 2 videos por día a las 03:00 AM)");

    cron.schedule('0 3 * * *', async () => {
        console.log('🌙 [Cron] Iniciando mantenimiento...');

        if (!existsSync(videoFolder)) {
            console.error("❌ Carpeta no existe.");
            return;
        }

        try {
            const processedList = await getProcessedVideos();

            const state = {
                processedToday: 0
            };

            await ejecutarMantenimiento(videoFolder, processedList, state);

            console.log(`🏁 Finalizado. Total procesados hoy: ${state.processedToday}`);

        } catch (err) {
            console.error("❌ Error crítico:", err);
        }
    });
};