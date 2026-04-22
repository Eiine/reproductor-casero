import { videoFolder } from '../utils/alias.js';
import { mapDirectory } from '../services/directoryMapper.js';
import { cleanOrphanThumbnails } from '../services/gc.js';
import { enqueueThumbnail } from '../services/thumbnailQueue.js';
import path from "path"
import fs from "fs"
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import util from 'util';
import { exec } from 'child_process';
ffmpeg.setFfmpegPath(ffmpegStatic);
const execPromise = util.promisify(exec);
ffmpeg.setFfmpegPath(ffmpegStatic);
ffmpeg.setFfprobePath(ffprobeInstaller.path);
// En tu controller
export const getVideos = async (req, res) => {
  try {
    const subPath = req.query.path || '';
    let targetPath = videoFolder;

    if (subPath) {
      const cleanPath = subPath.replace(/\.\./g, '').replace(/\/+/g, '/');
      targetPath = path.join(videoFolder, cleanPath);
      
      if (!targetPath.startsWith(videoFolder)) {
        return res.status(403).json({ error: "Acceso denegado" });
      }
    }
    
    if (!fs.existsSync(targetPath)) {
      return res.status(404).json({ error: "Carpeta no encontrada" });
    }
    
    const data = mapDirectory(targetPath);
    
    const folderData = data.folders.map(folder => ({
      name: folder.name,
      type: 'folder',
      displayName: folder.name
    }));

    // Mapear videos con la misma normalización
    const videoData = data.videos.map(file => {
    enqueueThumbnail(file.name, subPath);  
    
    const baseName = path.parse(file.name).name;
    
    return {
        ...file,
        
        thumbnail: `/thumbnails/${baseName}`, 
        type: 'video'
    };
});
    res.json({
      folders: folderData,
      videos: videoData,
      currentPath: subPath || '',
      parentPath: subPath ? path.dirname(subPath) : null
    });
    
  } catch (err) {
    console.error("Error en getVideos:", err);
    res.status(500).json({ error: "No se pudo procesar la lista" });
  }
};

export const playVideo = (req, res) => {
    const videoName = req.params.videoName;
    const videoPath = path.join(videoFolder, videoName);

    // 1. Verificación básica de existencia
    if (!fs.existsSync(videoPath)) {
        return res.status(404).send('Video no encontrado');
    }

    const stat = fs.statSync(videoPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    // 2. Análisis del archivo para decidir estrategia
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) {
            console.error('Error analizando video:', err);
            return res.status(500).send('Error al procesar video');
        }

        const videoStream = metadata.streams.find(s => s.codec_type === 'video');
        const audioStream = metadata.streams.find(s => s.codec_type === 'audio');

        const videoCodec = videoStream ? videoStream.codec_name : '';
        const audioCodec = audioStream ? audioStream.codec_name : '';
        const duration = metadata.format.duration;

        // --- CONFIGURACIÓN DE COMPATIBILIDAD ---
        const problematicVideo = ['hevc', 'h265', 'vp9', 'av1', 'wmv', 'divx', 'xvid', 'mjpeg'];
        const problematicAudio = ['ac3', 'eac3', 'dts', 'dts-hd', 'truehd', 'opus', 'flac', 'vorbis'];

        // Si no es H264 estándar o está en la lista negra, recodificamos video
        const needsVideoTranscode = videoCodec !== 'h264' || problematicVideo.includes(videoCodec);
        // Si el audio es conflictivo, recodificamos audio
        const needsAudioTranscode = problematicAudio.includes(audioCodec);
        
        const needsTranscoding = needsVideoTranscode || needsAudioTranscode;

        console.log(`[Streaming] ${videoName}`);
        console.log(`🎬 Video: ${videoCodec} -> ${needsVideoTranscode ? '🔄 Recodificando' : '✅ Directo'}`);
        console.log(`🎵 Audio: ${audioCodec} -> ${needsAudioTranscode ? '🔄 Recodificando' : '✅ Directo'}`);

        // --- GESTIÓN DE RECURSOS ---
        let ffmpegProcess = null;
        let fileStream = null;

        req.on('close', () => {
            if (ffmpegProcess) {
                console.log('🛑 Matando proceso FFmpeg...');
                ffmpegProcess.kill('SIGKILL');
            }
            if (fileStream) {
                fileStream.destroy();
            }
        });

        // --- OPCIONES DE TRANSCODIFICACIÓN OPTIMIZADAS ---
        const getTranscodeOptions = () => {
            const options = [
                '-movflags frag_keyframe+empty_moov+faststart',
                '-pix_fmt yuv420p', // Máxima compatibilidad de color
                '-sn'               // Deshabilitar subtítulos embebidos (evita errores de stream)
            ];

            if (needsVideoTranscode) {
                options.push('-c:v libx264');
                options.push('-preset superfast'); // Carga mínima de CPU
                options.push('-crf 23');           // Calidad estándar
                options.push('-profile:v main');    // Perfil compatible con TVs
                options.push('-level 4.0');
                // options.push('-vf scale=-2:720'); // DESCOMENTA ESTA LÍNEA SI EL SERVER SE TRABA CON 1080p
            } else {
                options.push('-c:v copy');
            }

            if (needsAudioTranscode) {
                options.push('-c:a aac');
                options.push('-ac 2');              // Forzar estéreo para evitar problemas de canales
                options.push('-b:a 128k');
            } else {
                options.push('-c:a copy');
            }

            return options;
        };

        // 3. RESPUESTA AL NAVEGADOR (STREAMING)
        if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunksize = (end - start) + 1;

            if (needsTranscoding) {
                // Estimamos el punto de inicio en segundos para FFmpeg
                const startTime = (start / fileSize) * duration;
                
                res.writeHead(206, {
                    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Type': 'video/mp4'
                });

                ffmpegProcess = ffmpeg(videoPath)
                    .setStartTime(startTime)
                    .outputOptions(getTranscodeOptions())
                    .on('error', (err) => {
                        if (!err.message.includes('SIGKILL')) console.error('FFmpeg error:', err.message);
                        res.end();
                    })
                    .pipe(res, { end: true });
            } else {
                res.writeHead(206, {
                    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': chunksize,
                    'Content-Type': 'video/mp4'
                });
                fileStream = fs.createReadStream(videoPath, { start, end });
                fileStream.pipe(res);
            }
        } else {
            // Carga completa o navegadores sin soporte de range inicial
            res.writeHead(200, { 'Content-Type': 'video/mp4' });
            
            if (needsTranscoding) {
                ffmpegProcess = ffmpeg(videoPath)
                    .outputOptions(getTranscodeOptions())
                    .on('error', (err) => res.end())
                    .pipe(res, { end: true });
            } else {
                res.writeHead(200, { 'Content-Length': fileSize, 'Content-Type': 'video/mp4' });
                fileStream = fs.createReadStream(videoPath);
                fileStream.pipe(res);
            }
        }
    });
};

export const uploadVideo = async (req, res) => {
    console.log('=== Iniciando upload ===');
    console.log('Body:', req.body);
    console.log('Files:', req.files);
    
    try {
        const { targetFolder } = req.body;
        const videoFile = req.files?.video;
        
        console.log('targetFolder:', targetFolder);
        console.log('videoFile:', videoFile ? videoFile.name : 'No file');
        
        if (!videoFile) {
            console.log('Error: No se recibió archivo');
            return res.status(400).json({ 
                success: false, 
                error: 'No se recibió ningún archivo de video' 
            });
        }

        // Validar extensión
        const allowedExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.webm'];
        const fileExt = path.extname(videoFile.name).toLowerCase();
        
        console.log('Extensión del archivo:', fileExt);
        
        if (!allowedExtensions.includes(fileExt)) {
            return res.status(400).json({ 
                success: false, 
                error: `Formato no soportado. Permitidos: ${allowedExtensions.join(', ')}` 
            });
        }

        // Determinar ruta de destino
        let destinationPath = videoFolder;
        console.log('Video folder base:', videoFolder);
        
        if (targetFolder && targetFolder !== 'raiz' && targetFolder !== '') {
            destinationPath = path.join(videoFolder, targetFolder);
            console.log('Destino con subcarpeta:', destinationPath);
            
            if (!fs.existsSync(destinationPath)) {
                console.log('Creando carpeta:', destinationPath);
                fs.mkdirSync(destinationPath, { recursive: true });
            }
        }

        // Normalizar nombre
        const normalizedName = videoFile.name.replace(/\s+/g, '_');
        const finalPath = path.join(destinationPath, normalizedName);
        
        console.log('Ruta final:', finalPath);
        
        // Verificar si existe
        if (fs.existsSync(finalPath)) {
            return res.status(409).json({ 
                success: false, 
                error: 'Ya existe un video con ese nombre en esta carpeta' 
            });
        }

        // Mover archivo
        console.log('Moviendo archivo...');
        await videoFile.mv(finalPath);
        console.log('Archivo movido exitosamente');
        
        res.status(200).json({
            success: true,
            message: 'Video subido exitosamente',
            data: {
                originalName: videoFile.name,
                savedName: normalizedName,
                path: finalPath,
                folder: targetFolder || 'raiz'
            }
        });
        
    } catch (error) {
        console.error('❌ Error DETALLADO al subir video:', error);
        console.error('Stack:', error.stack);
        res.status(500).json({ 
            success: false, 
            error: `Error interno: ${error.message}` 
        });
    }
};

