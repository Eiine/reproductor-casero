import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { mapDirectory } from './src/services/directoryMapper.js';
import { videoFolder } from './src/utils/alias.js';

const DB_PATH = path.join(process.cwd(), 'processed_videos.json');

// --- UTILIDADES ---
async function getProcessedVideos() {
    try {
        const data = await fs.readFile(DB_PATH, 'utf-8');
        return JSON.parse(data);
    } catch (err) { return []; }
}

async function saveToLog(videoPath) {
    const list = await getProcessedVideos();
    const absolutePath = path.resolve(videoPath);
    if (!list.includes(absolutePath)) {
        list.push(absolutePath);
        await fs.writeFile(DB_PATH, JSON.stringify(list, null, 2));
        console.log(`📝 Registro actualizado en el JSON.`);
    }
}

const runFullTestConversion = (videoPath) => {
    return new Promise((resolve, reject) => {
        const dir = path.dirname(videoPath);
        const ext = path.extname(videoPath);
        const baseName = path.basename(videoPath, ext);
        
        // Creamos un temporal único
        const tempPath = path.join(dir, `${baseName}_test_opt.mp4`);
        const finalPath = path.join(dir, `${baseName}.mp4`);

        console.log(`\n⚙️  TRABAJANDO: ${baseName}${ext}`);
        
        ffmpeg(videoPath)
            .outputOptions([
                '-c:v libx264', 
                '-profile:v high', 
                '-level:v 4.0',      // El límite mágico para el Centrino
                '-crf 23', 
                '-preset fast',
                '-c:a aac', 
                '-ar 44100',         
                '-b:a 125k', 
                '-ac 2',
                '-movflags +faststart'
            ])
            .on('progress', (p) => {
                process.stdout.write(`   ⏳ Progreso: ${Math.round(p.percent)}% | FPS: ${p.currentFps} \r`);
            })
            .on('error', (err) => reject(err))
            .on('end', async () => {
                try {
                    console.log(`\n   ✅ Conversión terminada.`);

                    // --- MANIOBRA DE REEMPLAZO REAL ---
                    const pathOrig = path.resolve(videoPath);
                    const pathDest = path.resolve(finalPath);

                    // 1. Borrar el original (sea .mkv, .avi o el .mp4 pesado)
                    console.log(`   🗑️  Borrando original: ${path.basename(videoPath)}`);
                    await fs.unlink(pathOrig);

                    // 2. Renombrar el temporal al nombre definitivo (.mp4)
                    console.log(`   ♻️  Renombrando temporal a: ${path.basename(finalPath)}`);
                    await fs.rename(tempPath, pathDest);
                    
                    await saveToLog(pathDest);
                    resolve(true);
                } catch (e) {
                    console.error(`\n❌ Error en el sistema de archivos:`, e);
                    reject(e);
                }
            })
            .save(tempPath);
    });
};

// --- MOTOR RECURSIVO ---
async function buscarYProcesarRecursivo(currentPath, processedList) {
    const data = mapDirectory(currentPath);
    
    for (const video of data.videos) {
        const fullPath = path.resolve(path.join(currentPath, video.name));

        if (processedList.includes(fullPath)) {
            console.log(`⏩ Saltando (ya en registro): ${video.name}`);
            continue;
        }

        const metadata = await new Promise((res) => {
            ffmpeg.ffprobe(fullPath, (err, meta) => res(meta));
        });

        const vStream = metadata?.streams.find(s => s.codec_type === 'video');
        const aStream = metadata?.streams.find(s => s.codec_type === 'audio');

        const isMP4 = path.extname(fullPath).toLowerCase() === '.mp4';
        const isH264 = vStream?.codec_name === 'h264';
        const isAAC = aStream?.codec_name === 'aac';
        const isLevelOk = vStream?.level <= 40; 
        const isAudioOk = parseInt(aStream?.sample_rate) <= 44100;

        if (!isMP4 || !isH264 || !isAAC || !isLevelOk || !isAudioOk) {
            console.log(`\n⚠️  DETECTADO PARA OPTIMIZAR: ${video.name}`);
            // Mostramos por qué falló para que sepas qué está arreglando
            if (!isLevelOk) console.log(`   -> Motivo: Level ${vStream.level / 10} es muy alto.`);
            if (!isAudioOk) console.log(`   -> Motivo: Audio a ${aStream.sample_rate}Hz.`);
            
            return await runFullTestConversion(fullPath);
        } else {
            console.log(`✅ Apto: ${video.name}`);
            await saveToLog(fullPath);
        }
    }

    for (const folder of data.folders) {
        const nextPath = path.join(currentPath, folder.name);
        console.log(`\n📂 Entrando a: ${folder.name}`);
        const hecho = await buscarYProcesarRecursivo(nextPath, processedList);
        if (hecho) return true;
    }

    return false;
}

async function startTest() {
    console.log("=== 🛠️ TEST DE PROCESO COMPLETO (REEMPLAZO REAL) ===");
    const processedList = await getProcessedVideos();
    const exito = await buscarYProcesarRecursivo(videoFolder, processedList);
    
    if (!exito) console.log("\n✨ Nada que procesar.");
}

startTest().catch(err => console.error("\n❌ Error:", err));