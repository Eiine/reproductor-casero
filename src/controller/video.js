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
    // Obtener ruta del query string, si existe
    const subPath = req.query.path || '';
    
    // Construir ruta completa (sanitizada)
    let targetPath = videoFolder;
    if (subPath) {
      // Normalizar y prevenir path traversal
      const cleanPath = subPath.replace(/\.\./g, '').replace(/\/+/g, '/');
      targetPath = path.join(videoFolder, cleanPath);
      
      
      // Validar que no se salga de videoFolder
      if (!targetPath.startsWith(videoFolder)) {
        return res.status(403).json({ error: "Acceso denegado" });
      }
    }
    
    // Verificar que la carpeta existe
    if (!fs.existsSync(targetPath)) {
      return res.status(404).json({ error: "Carpeta no encontrada" });
    }
    
    const data = mapDirectory(targetPath);
    
    // Limpiar miniaturas huérfanas (solo en raíz para no complicar)
    //if (!subPath) {
      //cleanOrphanThumbnails(data.baseNames);
    //}
    
    // Mapear carpetas
    const folderData = data.folders.map(folder => ({
      name: folder.name,
      type: 'folder',
      displayName: folder.name
    }));
    
    // Mapear videos
    const videoData = data.videos.map(file => {
       enqueueThumbnail(file.name, subPath);  // ← pasar subPath
        return {
    ...file,  // ← expande las propiedades de file (name, displayName)
    thumbnail: `/thumbnails/${file.displayName}.jpg`,
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

    if (!fs.existsSync(videoPath)) {
        return res.status(404).send('Video no encontrado');
    }

    const stat = fs.statSync(videoPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) {
            console.error('Error analizando video:', err);
            return res.status(500).send('Error al procesar video');
        }

        const audioStream = metadata.streams.find(s => s.codec_type === 'audio');
        const audioCodec = audioStream ? audioStream.codec_name : null;
        const problemCodecs = ['ac3', 'eac3', 'dts', 'dts-hd', 'truehd'];
        const needsTranscoding = problemCodecs.includes(audioCodec);

        console.log(`🎵 Audio: ${audioCodec} - ${needsTranscoding ? '🔄 Transcodificando' : '✅ Directo'}`);

        // --- MANEJO DE CIERRE DE RECURSOS ---
        let ffmpegProcess = null;
        let fileStream = null;

        req.on('close', () => {
            if (ffmpegProcess) {
                console.log('🛑 Matando proceso FFmpeg por desconexión...');
                ffmpegProcess.kill('SIGKILL');
            }
            if (fileStream) {
                console.log('📂 Cerrando stream de archivo...');
                fileStream.destroy();
            }
        });

        if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunksize = (end - start) + 1;

            res.writeHead(206, {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunksize,
                'Content-Type': 'video/mp4',
            });

            if (needsTranscoding) {
                ffmpegProcess = ffmpeg(videoPath)
                    .setStartTime(start / (fileSize / metadata.format.duration)) // Estimación de tiempo para el range
                    .outputOptions([
                        // '-hwaccel qsv', // COMENTAR SI NO ES INTEL (PC Desarrollo)
                        '-c:v copy',
                        '-c:a aac',
                        '-ac 2',
                        '-b:a 192k',
                        '-movflags frag_keyframe+empty_moov+faststart'
                    ])
                    .on('error', (err) => {
                        if (err.message && !err.message.includes('SIGKILL')) {
                            console.error('FFmpeg Error:', err.message);
                        }
                        res.end();
                    });
                
                ffmpegProcess.pipe(res, { end: true });
            } else {
                fileStream = fs.createReadStream(videoPath, { start, end });
                fileStream.pipe(res);
            }
        } else {
            // Carga completa (sin range)
            res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': fileSize });
            
            if (needsTranscoding) {
                ffmpegProcess = ffmpeg(videoPath)
                    .outputOptions(['-c:v copy', '-c:a aac', '-ac 2', '-movflags +faststart'])
                    .pipe(res, { end: true });
            } else {
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

