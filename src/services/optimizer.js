import cron from 'node-cron';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import { spawn } from 'child_process';
import { mapDirectory } from './directoryMapper.js';
import { videoFolder } from '../utils/alias.js';

// 🔧 CONFIGURACIÓN PARA DOCKER GLOBAL
// Forzamos el uso de los binarios globales del sistema (Debian Slim en tu Phenom 955)
ffmpeg.setFfmpegPath('/usr/bin/ffmpeg');
ffmpeg.setFfprobePath('/usr/bin/ffprobe');

// Ruta global para el spawn manual de ffprobe
const FFPROBE_PATH = '/usr/bin/ffprobe';

const DB_PATH = path.join(process.cwd(), 'processed_videos.json');

// 🔒 Límite por ejecución (por día)
const MAX_PER_RUN = 10;

// 🔥 CONTROL DE CONCURRENCIA PARA HARDWARE LIMITADO
const MAX_CONCURRENT_OPTIMIZATIONS = 1;  // Phenom 955: solo 1 a la vez

class OptimizerQueue {
    constructor() {
        this.activeProcesses = 0;
        this.queue = [];
    }

    async execute(task) {
        if (this.activeProcesses >= MAX_CONCURRENT_OPTIMIZATIONS) {
            return new Promise((resolve) => {
                this.queue.push(() => task().then(resolve));
            });
        }

        this.activeProcesses++;
        try {
            return await task();
        } finally {
            this.activeProcesses--;
            if (this.queue.length > 0) {
                const nextTask = this.queue.shift();
                nextTask();
            }
        }
    }
}

const optimizerQueue = new OptimizerQueue();

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

// 🔥 FFPROBE CON PROCESO CONTROLADO (sin zombies)
const getVideoInfo = (videoPath) => {
    return new Promise((resolve, reject) => {
        const isSlowDisk = videoPath.includes('/mnt/') ||
            videoPath.includes('/media/') ||
            !videoPath.includes('/ssd/');

        const probeTimeout = isSlowDisk ? 20000 : 10000;

        console.log(`    🔍 [Probe] Analizando: ${path.basename(videoPath)} (${isSlowDisk ? 'HDD' : 'SSD'})`);

        const probeProcess = spawn(FFPROBE_PATH, [
            '-v', 'quiet',
            '-print_format', 'json',
            '-show_streams',
            '-show_format',
            videoPath
        ], {
            stdio: ['ignore', 'pipe', 'pipe'],
            detached: false
        });

        let output = '';
        let errorOutput = '';
        let isResolved = false;

        const timeout = setTimeout(() => {
            if (!isResolved) {
                console.error(`    ⏰ [Probe] Timeout después de ${probeTimeout}ms`);
                if (probeProcess && !probeProcess.killed) {
                    probeProcess.kill('SIGTERM');
                    setTimeout(() => {
                        if (probeProcess && !probeProcess.killed) {
                            probeProcess.kill('SIGKILL');
                        }
                    }, 2000);
                }
                reject(new Error(`Probe timeout: El ${isSlowDisk ? 'disco mecánico' : 'SSD'} está tardando demasiado`));
                isResolved = true;
            }
        }, probeTimeout);

        probeProcess.stdout.on('data', (data) => {
            output += data;
            if (output.length > 10 * 1024 * 1024) {
                if (!isResolved) {
                    probeProcess.kill();
                    reject(new Error('Metadata del video demasiado grande'));
                    isResolved = true;
                }
            }
        });

        probeProcess.stderr.on('data', (data) => {
            errorOutput += data;
        });

        probeProcess.on('close', (code) => {
            clearTimeout(timeout);
            if (!isResolved) {
                if (code !== 0) {
                    console.error(`    ❌ [Probe] Error código ${code}: ${errorOutput.substring(0, 200)}`);
                    reject(new Error(`ffprobe exit code ${code}: ${errorOutput}`));
                } else {
                    try {
                        const metadata = JSON.parse(output);
                        console.log(`    ✅ [Probe] Análisis completado`);
                        resolve(metadata);
                    } catch (e) {
                        reject(new Error(`Error parseando metadata: ${e.message}`));
                    }
                }
                isResolved = true;
            }
        });

        probeProcess.on('error', (err) => {
            clearTimeout(timeout);
            if (!isResolved) {
                console.error(`    ❌ [Probe] Error al ejecutar: ${err.message}`);
                reject(err);
                isResolved = true;
            }
        });

        process.on('exit', () => {
            if (probeProcess && !probeProcess.killed) {
                probeProcess.kill('SIGKILL');
            }
        });
    });
};

// 🔥 VERIFICACIÓN DE NECESIDAD DE OPTIMIZACIÓN
const needsOptimization = (metadata, ext) => {
    const vStream = metadata.streams.find(s => s.codec_type === 'video');
    const aStream = metadata.streams.find(s => s.codec_type === 'audio');

    const isMP4 = ext.toLowerCase() === '.mp4';
    const isH264 = vStream?.codec_name === 'h264';
    const isAAC = aStream?.codec_name === 'aac';
    const isLevelOk = vStream?.level <= 40;
    const isAudioOk = parseInt(aStream?.sample_rate) <= 44100;

    return !(isMP4 && isH264 && isAAC && isLevelOk && isAudioOk);
};

// 🔥 CODIFICACIÓN SIN TIMEOUT
const encodeVideo = (videoPath, tempPath, finalPath) => {
    return new Promise((resolve, reject) => {
        let ffmpegProcess = null;
        let isResolved = false;

        console.log(`    🎬 [Encode] Iniciando codificación H264/AAC...`);
        console.log(`    ⏱️  [Encode] Sin límite de tiempo - el proceso durará lo necesario`);

        ffmpegProcess = ffmpeg(videoPath)
            .output(tempPath)
            .outputOptions([
                '-c:v libx264',
                '-preset ultrafast',  // Ideal para la carga del Phenom 955
                '-crf 23',
                '-profile:v high',    // Ahora sí va a funcionar perfecto
                '-level:v 4.0',
                '-pix_fmt yuv420p',   // 🚀 CLAVE: Aplana los 10 bits a 8 bits compatibles
                '-c:a aac',
                '-ar 44100',
                '-b:a 125k',
                '-ac 2',
                '-sn',                // Ignora los subtítulos .ass que traían fuentes adjuntas (.ttf)
                '-dn',
                '-movflags +faststart'
            ])
            .on('start', (commandLine) => {
                console.log(`    🚀 [Encode] FFmpeg iniciado (PID: ${ffmpegProcess.ffmpegProc?.pid || 'desconocido'})`);
            })
            .on('progress', (progress) => {
                if (progress.percent && !isResolved) {
                    console.log(`    📊 [Encode] Progreso: ${Math.round(progress.percent)}%`);
                }
            })
            .on('end', async () => {
                if (isResolved) return;
                isResolved = true;

                console.log(`    ✅ [Encode] Codificación completada`);

                try {
                    const stats = await fs.stat(tempPath);
                    if (stats.size === 0) {
                        throw new Error('El archivo temporal está vacío');
                    }

                    console.log(`    🗑️  Eliminando versión antigua...`);
                    await fs.unlink(videoPath);

                    console.log(`    ♻️  Estableciendo versión optimizada...`);
                    await fs.rename(tempPath, finalPath);

                    console.log(`    💾 Guardando en registro...`);
                    await saveProcessed(finalPath);

                    resolve(true);
                } catch (e) {
                    console.error(`    ❌ [Encode] Error en post-procesamiento:`, e.message);
                    reject(e);
                }
            })
            .on('error', async (e) => {
                if (isResolved) return;
                isResolved = true;

                console.error(`    ❌ [Encode] Error FFmpeg:`, e.message);

                try {
                    if (existsSync(tempPath)) {
                        await fs.unlink(tempPath);
                        console.log(`    🧹 Temporal eliminado: ${path.basename(tempPath)}`);
                    }
                } catch (cleanErr) {
                    console.error(`    ⚠️ No se pudo limpiar temporal:`, cleanErr.message);
                }

                reject(e);
            });

        ffmpegProcess.run();

        const cleanExit = () => {
            if (ffmpegProcess && ffmpegProcess.ffmpegProc && !ffmpegProcess.ffmpegProc.killed) {
                console.log(`    🧹 Limpiando proceso FFmpeg huérfano...`);
                ffmpegProcess.ffmpegProc.kill('SIGKILL');
            }
        };

        process.on('exit', cleanExit);
        process.on('SIGINT', cleanExit);
        process.on('SIGTERM', cleanExit);
    });
};

// --- CORE DE OPTIMIZACIÓN ---
const optimizeVideo = async (videoPath) => {
    return optimizerQueue.execute(async () => {
        const dir = path.dirname(videoPath);
        const ext = path.extname(videoPath);
        const baseName = path.basename(videoPath, ext);

        // Estabilizamos el nombre del temporal usando marcas de tiempo para evitar colisiones
        const tempPath = path.join(dir, `optimized_temp_${Date.now()}.mp4`);
        const finalPath = path.join(dir, `${baseName}.mp4`);

        console.log(`\n🎬 [Optimizer] Procesando: ${baseName}${ext}`);

        try {
            const metadata = await getVideoInfo(videoPath);

            if (!needsOptimization(metadata, ext)) {
                console.log(`✅ [Optimizer] Ya optimizado: ${baseName}${ext}`);
                await saveProcessed(videoPath);
                return false;
            }

            if (existsSync(tempPath)) {
                console.log(`    🧹 Limpiando temporal huérfano: ${path.basename(tempPath)}`);
                await fs.unlink(tempPath);
            }

            console.log(`🛠️  [Optimizer] Recodificando: ${baseName}${ext}`);
            const result = await encodeVideo(videoPath, tempPath, finalPath);

            console.log(`✅ [Optimizer] Finalizado: ${baseName}.mp4`);
            return result;

        } catch (error) {
            console.error(`❌ [Optimizer] Falló ${baseName}:`, error.message);

            try {
                if (existsSync(tempPath)) {
                    await fs.unlink(tempPath);
                }
            } catch { }

            throw error;
        }
    });
};

// --- NAVEGACIÓN RECURSIVA CON LÍMITE ---
async function ejecutarMantenimiento(currentPath, processedList, state) {
    if (state.processedToday >= MAX_PER_RUN) return;

    const data = mapDirectory(currentPath);

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
                console.log(`\n📊 Procesados en esta ejecución: ${state.processedToday}/${MAX_PER_RUN}`);
            }

            if (wasProcessed && state.processedToday < MAX_PER_RUN) {
                console.log(`⏸️  Esperando 2 segundos antes del siguiente video...`);
                await new Promise(resolve => setTimeout(resolve, 2000));
            }

        } catch (error) {
            console.error(`❌ Falló definitivamente: ${video.name}`, error.message);
        }
    }

    for (const folder of data.folders) {
        if (state.processedToday >= MAX_PER_RUN) return;

        const nextPath = path.join(currentPath, folder.name);
        await ejecutarMantenimiento(nextPath, processedList, state);
    }
}

// --- LIMPIAR TEMPORALES HUÉRFANOS ---
async function limpiarTemporalesHuérfanos(directory) {
    console.log('🧹 Buscando archivos temporales huérfanos...');

    const limpiarRecursivo = async (dir) => {
        try {
            const files = await fs.readdir(dir);
            for (const file of files) {
                const fullPath = path.join(dir, file);
                const stat = await fs.stat(fullPath).catch(() => null);

                if (stat && stat.isDirectory()) {
                    await limpiarRecursivo(fullPath);
                } else if (file.includes('optimized_temp_') || file.includes('_opt.tmp.mp4')) {
                    console.log(`    🗑️ Eliminando temporal huérfano: ${file}`);
                    await fs.unlink(fullPath).catch(() => { });
                }
            }
        } catch (error) {
            // Ignorar errores de permisos
        }
    };

    await limpiarRecursivo(directory);

    console.log('🧹 Verificando procesos FFmpeg zombies...');
    try {
        const { exec } = await import('child_process');
        const isWin = process.platform === 'win32';

        const cmd = isWin
            ? 'taskkill /f /im ffmpeg.exe'
            : 'pkill -f "ffmpeg.*optimized_temp_"';

        exec(cmd, (error) => {
            if (error) {
                console.log('    ✅ No se encontraron procesos zombies activos');
            } else {
                console.log('    🗑️ Procesos zombies eliminados del sistema');
            }
        });
    } catch (e) { }

    console.log('✅ Limpieza completada\n');
}

// --- FUNCIÓN PRINCIPAL DEL CRON ---
async function runOptimization() {
    console.log('🌙 [Cron] Iniciando mantenimiento...');

    const usedRAM = process.memoryUsage().rss / 1024 / 1024;
    console.log(`📊 Estado del sistema - RAM: ${Math.round(usedRAM)}MB / 4096MB`);

    if (usedRAM > 3500) {
        console.error('⚠️ RAM crítica (>3.5GB), abortando optimización');
        return;
    }

    if (!existsSync(videoFolder)) {
        console.error("❌ Carpeta de videos no existe.");
        return;
    }

    try {
        await limpiarTemporalesHuérfanos(videoFolder);

        const processedList = await getProcessedVideos();
        console.log(`📋 Videos ya procesados históricamente: ${processedList.length}`);

        const state = { processedToday: 0 };
        const startTime = Date.now();

        await ejecutarMantenimiento(videoFolder, processedList, state);

        const endTime = Date.now();
        const duration = ((endTime - startTime) / 1000).toFixed(2);

        console.log('\n🏁 === RESUMEN DE EJECUCIÓN ===');
        console.log(`✅ Videos procesados hoy: ${state.processedToday}/${MAX_PER_RUN}`);
        console.log(`⏱️  Tiempo total: ${duration} segundos`);
        console.log(`💾 RAM utilizada: ${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`);

        if (state.processedToday === MAX_PER_RUN) {
            console.log(`📌 Se alcanzó el límite de ${MAX_PER_RUN} videos por ejecución`);
        }

    } catch (err) {
        console.error("❌ Error crítico en mantenimiento:", err);
    }
}

// --- CRON ---
export const startOptimizationCron = () => {
    console.log(`⏰ Cron activo (máx ${MAX_PER_RUN} videos por día a las 04:02 PM)`);
    console.log(`⚙️  Configuración para hardware limitado: ${MAX_CONCURRENT_OPTIMIZATIONS} optimización concurrente`);
    console.log(`✅ Sin límite de tiempo para codificación - los videos tardarán lo necesario`);

    cron.schedule('2 16 * * *', async () => {
        console.log('\n' + '='.repeat(50));
        console.log(`🕒 Ejecución programada: ${new Date().toLocaleString()}`);
        console.log('='.repeat(50));

        await runOptimization();

        console.log('='.repeat(50));
        console.log(`🏁 Cron finalizado: ${new Date().toLocaleString()}`);
        console.log('='.repeat(50) + '\n');
    });
};

export { runOptimization, limpiarTemporalesHuérfanos, getProcessedVideos };