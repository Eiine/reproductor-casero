import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { generateThumbnail } from '../services/pick.js'; 
import { videoFolder } from "../utils/alias.js";

export const getVideos = async (req, res) => {
 
  const allowedExtensions = [".mp4", ".mkv", ".avi", ".mov", ".webm"];

  try {
    // Verificamos si la carpeta existe antes de leerla
    if (!fs.existsSync(videoFolder)) {
      return res.status(404).json({ error: `La carpeta de videos no existe en: ${videoFolder}` });
    }

    const files = fs.readdirSync(videoFolder)
                   .filter(file => allowedExtensions.some(ext => file.toLowerCase().endsWith(ext)));

    // Mapeamos los archivos a objetos con metadatos
    const videoData = files.map(file => {
      // 1. Extraemos el nombre base (sin .mp4, .mkv, etc.)
      const baseName = path.parse(file).name;
      
      // 2. Disparamos la generación de la miniatura (Async)
      // Pasamos el nombre completo del archivo al servicio
      generateThumbnail(file).catch(err => 
        console.error(`Error en segundo plano para ${file}:`, err.message)
      );

      // 3. Retornamos el objeto con la ruta de la miniatura ya normalizada
      return {
        name: file, // Nombre real del archivo para el reproductor
        displayName: baseName, // Nombre limpio para mostrar en la UI
        thumbnail: `/thumbnails/${baseName}.jpg` // Coincide con lo que genera pick.js
      };
    });

    res.json(videoData);
    
  } catch (err) {
    console.error("Error en getVideos:", err);
    return res.status(500).json({ error: "No se pudo procesar la lista de videos" });
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

