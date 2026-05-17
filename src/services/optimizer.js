import cron from 'node-cron';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import { spawn } from 'child_process';
import { mapDirectory } from './directoryMapper.js';
import { videoFolder } from '../utils/alias.js';

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
            // Esperar en cola en lugar de ejecutar en paralelo
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

// 🔥 NUEVO: FFPROBE EN PROCESO HIJO INDEPENDIENTE
const getVideoInfo = (videoPath) => {
    return new Promise((resolve, reject) => {
        // Detectar si estamos en disco mecánico
        const isSlowDisk = videoPath.includes('/mnt/') || 
                          videoPath.includes('/media/') ||
                          !videoPath.includes('/ssd/');
        
        // Ajustes para disco mecánico (20 segundos) vs SSD (10 segundos)
        const probeTimeout = isSlowDisk ? 20000 : 10000;
        
        console.log(`   🔍 [Probe] Analizando: ${path.basename(videoPath)} (${isSlowDisk ? 'HDD' : 'SSD'})`);
        
        const probeProcess = spawn('ffprobe', [
            '-v', 'quiet',
            '-print_format', 'json',
            '-show_streams',
            '-show_format',
            videoPath
        ], {
            stdio: ['ignore', 'pipe', 'pipe'],
            detached: false  // No dejar procesos huérfanos
        });
        
        let output = '';
        let errorOutput = '';
        
        const timeout = setTimeout(() => {
            console.error(`   ⏰ [Probe] Timeout después de ${probeTimeout}ms`);
            probeProcess.kill('SIGTERM');
            // Dar 2 segundos para limpiar
            setTimeout(() => {
                if (!probeProcess.killed) {
                    probeProcess.kill('SIGKILL');
                }
                reject(new Error(`Probe timeout: El ${isSlowDisk ? 'disco mecánico' : 'SSD'} está tardando demasiado`));
            }, 2000);
        }, probeTimeout);
        
        probeProcess.stdout.on('data', (data) => { 
            output += data;
            // Limitar buffer para evitar consumir RAM (máx 10MB)
            if (output.length > 10 * 1024 * 1024) {
                probeProcess.kill();
                reject(new Error('Metadata del video demasiado grande'));
            }
        });
        
        probeProcess.stderr.on('data', (data) => { 
            errorOutput += data;
        });
        
        probeProcess.on('close', (code) => {
            clearTimeout(timeout);
            if (code !== 0) {
                console.error(`   ❌ [Probe] Error código ${code}: ${errorOutput.substring(0, 200)}`);
                reject(new Error(`ffprobe exit code ${code}: ${errorOutput}`));
            } else {
                try {
                    const metadata = JSON.parse(output);
                    console.log(`   ✅ [Probe] Análisis completado`);
                    resolve(metadata);
                } catch (e) {
                    reject(new Error(`Error parseando metadata: ${e.message}`));
                }
            }
        });
        
        probeProcess.on('error', (err) => {
            clearTimeout(timeout);
            console.error(`   ❌ [Probe] Error al ejecutar: ${err.message}`);
            reject(err);
        });
    });
};

// 🔥 NUEVO: VERIFICACIÓN DE NECESIDAD DE OPTIMIZACIÓN
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

// 🔥 NUEVO: CODIFICACIÓN CON MANEJO MEJORADO
const encodeVideo = (videoPath, tempPath, finalPath) => {
    return new Promise((resolve, reject) => {
        const dir = path.dirname(videoPath);
        const ext = path.extname(videoPath);
        const baseName = path.basename(videoPath, ext);
        
        let ffmpegProcess = null;
        let timeoutId = null;
        
        // Timeout para codificación (10 minutos máximo)
        timeoutId = setTimeout(() => {
            if (ffmpegProcess) {
                console.error(`   ⏰ [Encode] Timeout después de 10 minutos`);
                ffmpegProcess.kill('SIGKILL');
                reject(new Error('Timeout en codificación (10 minutos)'));
            }
        }, 600000);
        
        console.log(`   🎬 [Encode] Iniciando codificación H264/AAC...`);
        
        ffmpegProcess = ffmpeg(videoPath)
            .outputOptions([
                '-c:v libx264',
                '-profile:v high',
                '-level:v 4.0',
                '-crf 23',
                '-preset fast',  // Balance entre velocidad y calidad
                '-c:a aac',
                '-ar 44100',
                '-b:a 125k',
                '-ac 2',
                '-movflags +faststart'
            ])
            .on('start', (commandLine) => {
                console.log(`   🚀 [Encode] FFmpeg iniciado`);
            })
            .on('progress', (progress) => {
                if (progress.percent) {
                    console.log(`   📊 [Encode] Progreso: ${Math.round(progress.percent)}%`);
                }
            })
            .on('end', async () => {
                clearTimeout(timeoutId);
                console.log(`   ✅ [Encode] Codificación completada`);
                
                try {
                    // Verificar que el archivo temporal existe y es válido
                    const stats = await fs.stat(tempPath);
                    if (stats.size === 0) {
                        throw new Error('El archivo temporal está vacío');
                    }
                    
                    console.log(`   🗑️  Eliminando versión antigua...`);
                    await fs.unlink(videoPath);
                    
                    console.log(`   ♻️  Estableciendo versión optimizada...`);
                    await fs.rename(tempPath, finalPath);
                    
                    console.log(`   💾 Guardando en registro...`);
                    await saveProcessed(finalPath);
                    
                    resolve(true);
                } catch (e) {
                    console.error(`   ❌ [Encode] Error en post-procesamiento:`, e.message);
                    reject(e);
                }
            })
            .on('error', async (e) => {
                clearTimeout(timeoutId);
                console.error(`   ❌ [Encode] Error FFmpeg:`, e.message);
                
                // Limpiar temporal si falla
                try {
                    if (existsSync(tempPath)) {
                        await fs.unlink(tempPath);
                        console.log(`   🧹 Temporal eliminado: ${path.basename(tempPath)}`);
                    }
                } catch (cleanErr) {
                    console.error(`   ⚠️ No se pudo limpiar temporal:`, cleanErr.message);
                }
                
                reject(e);
            })
            .save(tempPath);
    });
};

// --- CORE DE OPTIMIZACIÓN (VERSIÓN MEJORADA) ---
const optimizeVideo = async (videoPath) => {
    return optimizerQueue.execute(async () => {
        const dir = path.dirname(videoPath);
        const ext = path.extname(videoPath);
        const baseName = path.basename(videoPath, ext);
        
        const tempPath = path.join(dir, `${baseName}_opt.tmp.mp4`);
        const finalPath = path.join(dir, `${baseName}.mp4`);
        
        console.log(`\n🎬 [Optimizer] Procesando: ${baseName}${ext}`);
        
        try {
            // 🔥 PASO 1: Análisis con proceso hijo independiente
            const metadata = await getVideoInfo(videoPath);
            
            // 🔥 PASO 2: Verificar si necesita optimización
            if (!needsOptimization(metadata, ext)) {
                console.log(`✅ [Optimizer] Ya optimizado: ${baseName}${ext}`);
                await saveProcessed(videoPath);
                return false;
            }
            
            // 🔥 PASO 3: Eliminar temporales huérfanos si existen
            if (existsSync(tempPath)) {
                console.log(`   🧹 Limpiando temporal huérfano: ${path.basename(tempPath)}`);
                await fs.unlink(tempPath);
            }
            
            // 🔥 PASO 4: Codificar video
            console.log(`🛠️  [Optimizer] Recodificando: ${baseName}${ext}`);
            const result = await encodeVideo(videoPath, tempPath, finalPath);
            
            console.log(`✅ [Optimizer] Finalizado: ${baseName}.mp4`);
            return result;
            
        } catch (error) {
            console.error(`❌ [Optimizer] Falló ${baseName}:`, error.message);
            
            // Limpieza de emergencia
            try {
                if (existsSync(tempPath)) {
                    await fs.unlink(tempPath);
                }
            } catch {}
            
            throw error;
        }
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
                console.log(`\n📊 Procesados en esta ejecución: ${state.processedToday}/${MAX_PER_RUN}`);
            }
            
            // Pequeña pausa entre videos para liberar recursos
            if (wasProcessed && state.processedToday < MAX_PER_RUN) {
                console.log(`⏸️  Esperando 2 segundos antes del siguiente video...`);
                await new Promise(resolve => setTimeout(resolve, 2000));
            }

        } catch (error) {
            console.error(`❌ Falló definitivamente: ${video.name}`, error.message);
        }
    }

    // 📁 Subcarpetas
    for (const folder of data.folders) {
        if (state.processedToday >= MAX_PER_RUN) return;

        const nextPath = path.join(currentPath, folder.name);
        await ejecutarMantenimiento(nextPath, processedList, state);
    }
}

// --- FUNCIÓN PARA LIMPIAR TEMPORALES HUÉRFANOS ---
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
                } else if (file.includes('_opt.tmp.mp4')) {
                    console.log(`   🗑️ Eliminando temporal huérfano: ${file}`);
                    await fs.unlink(fullPath).catch(() => {});
                }
            }
        } catch (error) {
            // Ignorar errores de permisos en carpetas
        }
    };
    
    await limpiarRecursivo(directory);
    console.log('✅ Limpieza de temporales completada\n');
}

// --- FUNCIÓN PRINCIPAL DEL CRON (MEJORADA) ---
async function runOptimization() {
    console.log('🌙 [Cron] Iniciando mantenimiento...');
    
    // Verificar salud del sistema antes de empezar
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
        // Limpiar temporales huérfanos antes de empezar
        await limpiarTemporalesHuérfanos(videoFolder);
        
        const processedList = await getProcessedVideos();
        console.log(`📋 Videos ya procesados históricamente: ${processedList.length}`);
        
        const state = {
            processedToday: 0
        };

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

// --- CRON (VERSIÓN MEJORADA) ---
export const startOptimizationCron = () => {
    console.log(`⏰ Cron activo (máx ${MAX_PER_RUN} videos por día a las 03:00 AM)`);
    console.log(`⚙️  Configuración para hardware limitado: ${MAX_CONCURRENT_OPTIMIZATIONS} optimización concurrente`);
    
    cron.schedule('4 13 * * *', async () => {
        console.log('\n' + '='.repeat(50));
        console.log(`🕒 Ejecución programada: ${new Date().toLocaleString()}`);
        console.log('='.repeat(50));
        
        await runOptimization();
        
        console.log('='.repeat(50));
        console.log(`🏁 Cron finalizado: ${new Date().toLocaleString()}`);
        console.log('='.repeat(50) + '\n');
    });
};

// Exportar funciones útiles para debugging
export { runOptimization, limpiarTemporalesHuérfanos, getProcessedVideos };