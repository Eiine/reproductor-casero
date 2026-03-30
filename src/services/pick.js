import ffmpegPath from 'ffmpeg-static';
import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';
import { videoFolder,thumbFolder } from '../utils/alias.js';


ffmpeg.setFfmpegPath(ffmpegPath);


/**
 * Genera una miniatura de un video.
 * @param {string} videoName - Nombre del archivo de video.
 * @param {string|number} time - Tiempo del video para capturar (por defecto 5 segundos).
 */
export const generateThumbnail = (videoName, time = 60) => {
    return new Promise((resolve, reject) => {

        
        // Nombre de salida: "nombre_video.jpg" (sin la extensión original del video)
        const baseName = path.parse(videoName).name;
        const thumbName = `${baseName}.jpg`;
        const thumbPath = path.join(thumbFolder, thumbName);
        const videoPath = path.join(videoFolder, videoName);

        // 1. Si la miniatura ya existe, resolver inmediatamente
        if (fs.existsSync(thumbPath)) {
            return resolve(thumbName);
        }

        // 2. Verificar que el video de origen exista
        if (!fs.existsSync(videoPath)) {
            return reject(new Error(`Archivo de video no encontrado: ${videoPath}`));
        }

        // 3. Asegurar que la carpeta de destino exista
        if (!fs.existsSync(thumbFolder)) {
            fs.mkdirSync(thumbFolder, { recursive: true });
        }

        // 4. Ejecutar FFmpeg
        ffmpeg(videoPath)
            .on('end', () => resolve(thumbName))
            .on('error', (err) => reject(err))
            .screenshots({
                timestamps: [time],
                filename: thumbName,
                folder: thumbFolder,
                size: '320x180'
            });
    });
};