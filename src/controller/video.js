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

    // 1. Verificar si el archivo existe
    if (!fs.existsSync(videoPath)) {
        return res.status(404).send('Video no encontrado');
    }

    const stat = fs.statSync(videoPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    // 2. Analizar el audio del video
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) {
            console.error('Error analizando video:', err);
            return res.status(500).send('Error al procesar video');
        }

        // Buscar la pista de audio
        const audioStream = metadata.streams.find(s => s.codec_type === 'audio');
        const audioCodec = audioStream ? audioStream.codec_name : null;
        
        // Formatos problemáticos para TV
        const problemCodecs = ['ac3', 'eac3', 'dts', 'dts-hd', 'truehd'];
        const needsTranscoding = problemCodecs.includes(audioCodec);

        console.log(`🎵 Audio detectado: ${audioCodec} - ${needsTranscoding ? '🔄 Necesita conversión' : '✅ Directo'}`);

        // 3. Manejar el streaming según si necesita conversión o no
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
                // 🔄 TRANScodificación: Convierte audio en tiempo real
                console.log('🎵 Transcodificando audio a AAC...');
                ffmpeg(videoPath)
                    .outputOptions([
                        '-hwaccel qsv',
                        '-c:v copy',      // Copia el video SIN tocar (rápido)
                        '-c:a aac',       // Convierte audio a AAC (compatible con TV)
                        '-ac 2',          // Convierte 5.1 a estéreo (2 canales)
                        '-b:a 192k',      // Calidad de audio buena
                        '-movflags frag_keyframe+empty_moov' // Streaming fluido
                    ])
                    .on('error', (err) => {
                        console.error('Error transcodificando:', err);
                        res.end();
                    })
                    .pipe(res, { end: true });
            } else {
                // ✅ DIRECTO: El audio ya es compatible
                console.log('✅ Audio compatible, sirviendo directo');
                const file = fs.createReadStream(videoPath, { start, end });
                file.pipe(res);
            }
        } else {
            // Sin rango (carga completa)
            res.writeHead(200, { 'Content-Type': 'video/mp4' });
            
            if (needsTranscoding) {
                ffmpeg(videoPath)
                    .outputOptions(['-c:v copy', '-c:a aac', '-ac 2'])
                    .pipe(res, { end: true });
            } else {
                fs.createReadStream(videoPath).pipe(res);
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

