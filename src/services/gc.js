import fs from 'fs';
import path from 'path';
import { projectRoot,thumbFolder,videoFolder } from '../utils/alias.js';


export const cleanOrphanThumbnails = () => {
    return new Promise((resolve, reject) => {

        try {
            // 1. Si no hay carpeta de miniaturas, no hay nada que limpiar
            if (!fs.existsSync(thumbFolder)) return resolve();

            // 2. Obtenemos lista de videos actuales (solo nombres base sin extensión)
            const videoFiles = fs.readdirSync(videoFolder).map(f => path.parse(f).name);
            
            // 3. Leemos las miniaturas existentes
            const thumbFiles = fs.readdirSync(thumbFolder);

            let deletedCount = 0;

            thumbFiles.forEach(thumb => {
                const thumbBaseName = path.parse(thumb).name;

                // 4. Si la miniatura no tiene un video que coincida, al tacho
                if (!videoFiles.includes(thumbBaseName)) {
                    fs.unlinkSync(path.join(thumbFolder, thumb));
                    deletedCount++;
                    console.log(`[GC] 🗑️ Miniatura eliminada: ${thumb}`);
                }
            });

            if (deletedCount > 0) {
                console.log(`[GC] ✨ Limpieza completada. Se eliminaron ${deletedCount} archivos.`);
            }
            
            resolve(deletedCount);
        } catch (error) {
            console.error("[GC] ❌ Error durante la limpieza:", error);
            reject(error);
        }
    });
};