import ffmpegPath from 'ffmpeg-static';
import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';
import { videoFolder, thumbFolder } from '../utils/alias.js';

ffmpeg.setFfmpegPath(ffmpegPath);


export const generateThumbnail = (videoName, subPath = '', time = 10) => {
    return new Promise((resolve, reject) => {
        // 1. Usar path.join de forma limpia
        const videoPath = path.join(videoFolder, subPath, videoName);
        
        // 2. IMPORTANTE: Si usas normalización, el frontend debe saberlo.
        // Recomiendo NO normalizar aquí si mapDirectory ya te da un nombre limpio.
        const baseName = path.parse(videoName).name; 
        const thumbName = `${baseName}.jpg`;
        const thumbPath = path.join(thumbFolder, thumbName);

        if (fs.existsSync(thumbPath)) return resolve(thumbName);
        if (!fs.existsSync(videoPath)) return reject(new Error(`No existe: ${videoPath}`));

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