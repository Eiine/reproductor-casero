import ffmpegPath from 'ffmpeg-static';
import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';
import { videoFolder, thumbFolder } from '../utils/alias.js';

ffmpeg.setFfmpegPath(ffmpegPath);

export const generateThumbnail = (videoName, subPath = '', time = 20) => {
    return new Promise((resolve, reject) => {
        const videoPath = path.join(videoFolder, subPath, videoName);
        
        // 1. Obtener nombre base
        const baseName = path.parse(videoName).name; 
        
        // 2. REGLA: Sustituir espacios por guiones bajos
        const safeBaseName = baseName.replace(/ /g, '_'); 
        
        const thumbName = `${safeBaseName}.jpg`;
        const thumbPath = path.join(thumbFolder, thumbName);

        if (fs.existsSync(thumbPath)) return resolve(thumbName);
        if (!fs.existsSync(videoPath)) return reject(new Error(`No existe: ${videoPath}`));

        ffmpeg(videoPath)
            .on('end', () => resolve(thumbName))
            .on('error', (err) => reject(err))
            .screenshots({
                timestamps: [time],
                filename: thumbName, // Se guardará como 'video_con_guiones.jpg'
                folder: thumbFolder,
                size: '320x180'
            });
    });
};