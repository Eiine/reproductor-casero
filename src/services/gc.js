import fs from 'fs';
import path from 'path';
import { thumbFolder } from '../utils/alias.js';

// 🔹 mismo normalizador
const normalize = name => name.replace(/\s+/g, "_");

export const cleanOrphanThumbnails = (baseNames) => {
    try {
        if (!fs.existsSync(thumbFolder)) return 0;

        const videoSet = new Set(
            baseNames.map(name => normalize(name))
        );

        const thumbFiles = fs.readdirSync(thumbFolder);

        let deletedCount = 0;

        thumbFiles.forEach(thumb => {
            const thumbBaseName = path.parse(thumb).name;

            if (!videoSet.has(thumbBaseName)) {
                fs.unlinkSync(path.join(thumbFolder, thumb));
                deletedCount++;
                console.log(`[GC] 🗑️ Eliminada: ${thumb}`);
            }
        });

        return deletedCount;

    } catch (error) {
        console.error("[GC] ❌", error);
        return 0;
    }
};