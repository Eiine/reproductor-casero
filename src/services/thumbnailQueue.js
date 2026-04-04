// services/thumbnailQueue.js

import { generateThumbnail } from './pick.js';


let queue = [];
let processing = false;

export const enqueueThumbnail = (videoName, subPath = '') => {

    queue.push({ videoName, subPath });
    processQueue();
};

const processQueue = async () => {
    if (processing || queue.length === 0) return;
    
    processing = true;
    
    while (queue.length > 0) {
        const { videoName, subPath } = queue.shift();
        
        try {
            await generateThumbnail(videoName, subPath);  // ← pasar subPath
        } catch (err) {
            console.error("Queue thumbnail error:", err.message);
        }
    }
    
    processing = false;
};