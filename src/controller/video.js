import { videoFolder } from '../utils/alias.js';
import { mapDirectory } from '../services/directoryMapper.js';
import { cleanOrphanThumbnails } from '../services/gc.js';
import { enqueueThumbnail } from '../services/thumbnailQueue.js';
import path from "path"
import fs from "fs"
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
      enqueueThumbnail(file.name);
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
    
    const videoPath = path.join(videoFolder, videoName); // Ajusta tu carpeta de videos
    
    // 1. Verificar si el archivo existe
    if (!fs.existsSync(videoPath)) {
        return res.status(404).send('Video no encontrado');
    }

    const stat = fs.statSync(videoPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    // 2. Si el navegador solicita un rango (streaming)
    if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = (end - start) + 1;
        
        const file = fs.createReadStream(videoPath, { start, end });
        
        const head = {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize,
            'Content-Type': 'video/mp4', // Asegúrate de que coincida con tu formato
        };

        res.writeHead(206, head); // 206 = Partial Content
        file.pipe(res);
    } else {
        // 3. Si no hay rango (carga inicial o navegadores antiguos)
        const head = {
            'Content-Length': fileSize,
            'Content-Type': 'video/mp4',
        };
        res.writeHead(200, head);
        fs.createReadStream(videoPath).pipe(res);
    }
};

