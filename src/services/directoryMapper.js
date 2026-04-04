import fs from 'fs';
import path from 'path';

const allowedExtensions = [".mp4", ".mkv", ".avi", ".mov", ".webm"];

// 🔹 Normalizador único
const normalize = name => name.replace(/\s+/g, "_");

export const mapDirectory = (targetPath) => {

    const result = {
        folders: [],
        videos: [],
        baseNames: []
    };

    if (!fs.existsSync(targetPath)) return result;

    const entries = fs.readdirSync(targetPath, { withFileTypes: true });

    entries.forEach(entry => {

        // 📁 Carpetas
        if (entry.isDirectory()) {
            result.folders.push({
                name: entry.name,
                type: "folder"
            });
            return;
        }

        // 🎬 Videos
        if (allowedExtensions.some(ext => 
            entry.name.toLowerCase().endsWith(ext))) {

            const normalized = normalize(entry.name);
            const baseName = path.parse(normalized).name;

            result.videos.push({
                name: entry.name,
                displayName: baseName,
                type: "video"
            });

            result.baseNames.push(baseName);
        }
    });

    return result;
};