import path from "path";
import fs from "fs";
import { videoFolder } from "../utils/alias.js";
import { mapDirectory } from "../services/directoryMapper.js";
import { cleanOrphanThumbnails } from '../services/gc.js';
import { enqueueThumbnail } from '../services/thumbnailQueue.js';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import util from 'util';
import { exec } from 'child_process';

ffmpeg.setFfmpegPath('/usr/bin/ffmpeg');
ffmpeg.setFfprobePath('/usr/bin/ffprobe');
const execPromise = util.promisify(exec);

// ========== SUBIR MÚLTIPLES VIDEOS (CARPETA COMPLETA) - NUEVO ENDPOINT ==========
export const uploadMultipleVideos = async (req, res) => {
    console.log('=== 📦 INICIANDO CARGA MASIVA DE VIDEOS ===');
    
    try {
        const { targetFolder } = req.body;
        const videoFiles = req.files?.videos;
        
        if (!videoFiles) {
            return res.status(400).json({ 
                success: false, 
                error: 'No se recibieron archivos de video' 
            });
        }
        
        // Asegurar que sea un array
        const filesArray = Array.isArray(videoFiles) ? videoFiles : [videoFiles];
        
        console.log(`📁 Carpeta destino: ${targetFolder || 'raíz'}`);
        console.log(`🎬 Archivos a subir: ${filesArray.length}`);
        
        // Determinar ruta de destino
        let destinationPath = videoFolder;
        
        if (targetFolder && targetFolder !== 'raiz' && targetFolder !== '') {
            destinationPath = path.join(videoFolder, targetFolder);
            
            if (!fs.existsSync(destinationPath)) {
                console.log('📁 Creando carpeta:', destinationPath);
                fs.mkdirSync(destinationPath, { recursive: true });
            }
        }
        
        const results = [];
        const errors = [];
        
        for (const videoFile of filesArray) {
            try {
                // Validar extensión
                const allowedExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.webm'];
                const fileExt = path.extname(videoFile.name).toLowerCase();
                
                if (!allowedExtensions.includes(fileExt)) {
                    errors.push({ 
                        name: videoFile.name, 
                        error: `Formato no soportado. Permitidos: ${allowedExtensions.join(', ')}` 
                    });
                    continue;
                }
                
                // Normalizar nombre del archivo
                const normalizedName = videoFile.name.replace(/\s+/g, '_');
                const finalPath = path.join(destinationPath, normalizedName);
                
                // Verificar si ya existe
                if (fs.existsSync(finalPath)) {
                    errors.push({ 
                        name: videoFile.name, 
                        error: 'Ya existe un archivo con este nombre' 
                    });
                    continue;
                }
                
                // Mover archivo
                await videoFile.mv(finalPath);
                results.push({
                    name: videoFile.name,
                    savedName: normalizedName,
                    path: finalPath,
                    size: videoFile.size
                });
                
                console.log(`✅ Subido: ${videoFile.name}`);
                
            } catch (error) {
                console.error(`❌ Error con ${videoFile.name}:`, error);
                errors.push({ 
                    name: videoFile.name, 
                    error: error.message 
                });
            }
        }
        
        console.log(`📊 Resumen: ${results.length} exitosos, ${errors.length} fallidos`);
        
        res.status(200).json({
            success: true,
            message: `Procesados ${filesArray.length} archivos. ${results.length} subidos correctamente, ${errors.length} fallaron.`,
            data: {
                successful: results,
                failed: errors,
                total: filesArray.length,
                folder: targetFolder || 'raiz'
            }
        });
        
    } catch (error) {
        console.error('❌ Error en carga masiva:', error);
        res.status(500).json({ 
            success: false, 
            error: `Error interno: ${error.message}` 
        });
    }
};


// ========== SUBIR VIDEO (LÓGICA COMPLETA) ==========
export const uploadVideo = async (req, res) => {
    console.log('=== 📤 INICIANDO SUBIDA DE VIDEO ===');
    
    try {
        // Validar que exista req.body
        if (!req.body) {
            return res.status(400).json({ 
                success: false, 
                error: 'No se recibieron datos del formulario' 
            });
        }

        const { targetFolder } = req.body;
        const videoFile = req.files?.video;
        
        console.log('📁 Carpeta destino:', targetFolder || 'raíz');
        console.log('🎬 Archivo:', videoFile?.name);
        console.log('📊 Tamaño:', videoFile?.size ? (videoFile.size / (1024*1024)).toFixed(2) + ' MB' : 'No especificado');
        
        // Validar archivo
        if (!videoFile) {
            return res.status(400).json({ 
                success: false, 
                error: 'No se recibió ningún archivo de video' 
            });
        }

        // Validar extensión
        const allowedExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.webm'];
        const fileExt = path.extname(videoFile.name).toLowerCase();
        
        if (!allowedExtensions.includes(fileExt)) {
            return res.status(400).json({ 
                success: false, 
                error: `Formato no soportado. Permitidos: ${allowedExtensions.join(', ')}` 
            });
        }

        // Determinar ruta de destino
        let destinationPath = videoFolder;
        
        if (targetFolder && targetFolder !== 'raiz' && targetFolder !== '') {
            destinationPath = path.join(videoFolder, targetFolder);
            
            if (!fs.existsSync(destinationPath)) {
                console.log('📁 Creando carpeta:', destinationPath);
                fs.mkdirSync(destinationPath, { recursive: true });
            }
        }

        // Normalizar nombre del archivo
        const normalizedName = videoFile.name.replace(/\s+/g, '_');
        const finalPath = path.join(destinationPath, normalizedName);
        
        // Verificar si ya existe
        if (fs.existsSync(finalPath)) {
            return res.status(409).json({ 
                success: false, 
                error: 'Ya existe un video con ese nombre en esta carpeta' 
            });
        }

        // Mover archivo al destino final
        console.log('💾 Guardando en:', finalPath);
        await videoFile.mv(finalPath);
        
        console.log('✅ Video subido exitosamente');
        
        res.status(200).json({
            success: true,
            message: 'Video subido exitosamente',
            data: {
                originalName: videoFile.name,
                savedName: normalizedName,
                path: finalPath,
                folder: targetFolder || 'raiz',
                size: videoFile.size
            }
        });
        
    } catch (error) {
        console.error('❌ Error al subir video:', error);
        res.status(500).json({ 
            success: false, 
            error: `Error interno: ${error.message}` 
        });
    }
};

// ========== OBTENER VIDEOS Y CARPETAS ==========
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

        // 🛡️ FILTRO APLICADO AQUÍ: Filtramos la lista de videos antes de encolar y mapear
        const videosFiltrados = data.videos.filter(file => {
            const name = file.name.toLowerCase();
            // Ignora archivos temporales comunes y el patrón del optimizador
            return !name.endsWith('.tmp') && !name.includes('_opt.tmp');
        });

        // Mapeamos y encolamos usando únicamente los videos válidos
        const videoData = videosFiltrados.map(file => {
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

// ========== REPRODUCIR VIDEO ==========
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
            console.error('❌ Error analizando video en streaming:', err);
            return res.status(500).send('Error al procesar video');
        }

        const videoStream = metadata.streams.find(s => s.codec_type === 'video');
        const audioStream = metadata.streams.find(s => s.codec_type === 'audio');
        const videoCodec = videoStream ? videoStream.codec_name : '';
        const audioCodec = audioStream ? audioStream.codec_name : '';
        const duration = metadata.format?.duration || 0;

        // Codecs pesados o incompatibles con streaming web directo
        const problematicVideo = ['hevc', 'h265', 'vp9', 'av1', 'wmv', 'divx', 'xvid', 'mjpeg'];
        const problematicAudio = ['ac3', 'eac3', 'dts', 'dts-hd', 'truehd', 'opus', 'flac', 'vorbis'];

        const needsVideoTranscode = videoCodec !== 'h264' || problematicVideo.includes(videoCodec);
        const needsAudioTranscode = problematicAudio.includes(audioCodec);
        const needsTranscoding = needsVideoTranscode || needsAudioTranscode;

        console.log(`\n🎬 [Streaming] Solicitado: ${videoName}`);
        console.log(`🎥 Video Codec: ${videoCodec} -> ${needsVideoTranscode ? '🔄 Transcodificando en vivo' : '✅ Transmisión Directa'}`);
        console.log(`🎵 Audio Codec: ${audioCodec} -> ${needsAudioTranscode ? '🔄 Transcodificando en vivo' : '✅ Transmisión Directa'}`);

        let ffmpegProcess = null;
        let fileStream = null;

        // Limpieza absoluta al cerrar la pestaña o pausar para evitar procesos zombies
        req.on('close', () => {
            if (ffmpegProcess) {
                console.log(`🛑 [Streaming] Deteniendo transcodificación de ${videoName}`);
                ffmpegProcess.kill('SIGKILL');
            }
            if (fileStream) {
                fileStream.destroy();
            }
        });

        const getTranscodeOptions = () => {
            const options = [
                '-movflags frag_keyframe+empty_moov+faststart',
                '-pix_fmt yuv420p',
                '-sn'
            ];

            if (needsVideoTranscode) {
                options.push('-c:v libx264');
                options.push('-preset superfast'); // Clave absoluta para no ahogar el micro
                options.push('-crf 24');           // Un punto más de compresión balancea la carga en vivo
                options.push('-profile:v main');
                options.push('-level 4.0');
            } else {
                options.push('-c:v copy');
            }

            if (needsAudioTranscode) {
                options.push('-c:a aac');
                options.push('-ac 2');
                options.push('-b:a 128k');
            } else {
                options.push('-c:a copy');
            }

            return options;
        };

        if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunksize = (end - start) + 1;

            if (needsTranscoding) {
                // Si requiere convertirse en vivo, calculamos el punto de tiempo para saltar allá
                const startTime = duration ? (start / fileSize) * duration : 0;
                
                // En transcodificación viva NO enviamos Content-Length estático porque altera al navegador
                res.writeHead(206, {
                    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Type': 'video/mp4'
                });

                ffmpegProcess = ffmpeg(videoPath)
                    .setStartTime(startTime.toFixed(2))
                    .outputOptions(getTranscodeOptions())
                    .toFormat('mp4')
                    .on('error', (err) => {
                        if (!err.message.includes('SIGKILL') && !err.message.includes('Output stream closed')) {
                            console.error('❌ Error FFmpeg en streaming:', err.message);
                        }
                        try { res.end(); } catch {}
                    })
                    .pipe(res, { end: true });
            } else {
                // Transmisión nativa por partes (Lectura directa ultra veloz)
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
            // Reproducción desde el segundo 0
            if (needsTranscoding) {
                res.writeHead(200, { 'Content-Type': 'video/mp4' });
                
                ffmpegProcess = ffmpeg(videoPath)
                    .outputOptions(getTranscodeOptions())
                    .toFormat('mp4')
                    .on('error', (err) => {
                        try { res.end(); } catch {}
                    })
                    .pipe(res, { end: true });
            } else {
                res.writeHead(200, { 'Content-Length': fileSize, 'Content-Type': 'video/mp4' });
                fileStream = fs.createReadStream(videoPath);
                fileStream.pipe(res);
            }
        }
    });
};