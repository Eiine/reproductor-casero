import ffmpegPath from 'ffmpeg-static';
import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';
import { videoFolder, thumbFolder } from '../utils/alias.js';

ffmpeg.setFfmpegPath(ffmpegPath);

// 🔹 mismo normalizador
const normalize = name => name.replace(/\s+/g, "_");

export const generateThumbnail = (videoName, subPath = '', time = 60) => {
    return new Promise((resolve, reject) => {
        // Construir ruta completa del video
        let videoPath;
        if (subPath) {
            videoPath = path.join(videoFolder, subPath, videoName);
        } else {
            videoPath = path.join(videoFolder, videoName);
        }
        
        // Construir nombre y ruta de la thumbnail
        const normalized = normalize(videoName);
        const baseName = path.parse(normalized).name;
        const thumbName = `${baseName}.jpg`;
        const thumbPath = path.join(thumbFolder, thumbName);
        
        console.log("📂 Video path:", videoPath);
        console.log("📸 Thumb path:", thumbPath);
        console.log("✅ Video existe?:", fs.existsSync(videoPath));
        
        // Si la thumbnail ya existe, no la regeneres
        if (fs.existsSync(thumbPath)) {
            console.log("⏭️ Thumbnail ya existe:", thumbName);
            return resolve(thumbName);
        }
        
        // Verificar que el video existe
        if (!fs.existsSync(videoPath)) {
            return reject(new Error(`Archivo no encontrado: ${videoPath}`));
        }
        
        // Generar thumbnail con ffmpeg
        ffmpeg(videoPath)
            .on('end', () => {
                console.log("✅ Thumbnail generada:", thumbName);
                resolve(thumbName);
            })
            .on('error', (err) => {
                console.error("❌ Error ffmpeg:", err.message);
                reject(err);
            })
            .screenshots({
                timestamps: [time],
                filename: thumbName,
                folder: thumbFolder,
                size: '320x180'
            });
    });
};