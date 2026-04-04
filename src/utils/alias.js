import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.join(__dirname, "..", "..");
const videoFolder = path.join(projectRoot, "src", "videos");
const thumbFolder = path.join(projectRoot, 'public', 'thumbnails');

export{ projectRoot, videoFolder, thumbFolder }