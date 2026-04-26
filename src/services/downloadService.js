import { exec } from 'child_process';
import util from 'util';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import ProgressBar from 'progress';

const execPromise = util.promisify(exec);

// Función para extraer links de un archivo de texto
export function extractLinksFromText(textContent) {
    // Regex para detectar URLs (HTTP, HTTPS, FTP, etc.)
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const links = textContent.match(urlRegex) || [];
    
    // Filtrar links duplicados y limpiar
    const uniqueLinks = [...new Set(links)];
    
    return uniqueLinks.map(link => link.trim());
}

// Función para detectar el tipo de link y descargar
export async function downloadVideo(url, outputPath, onProgress) {
    try {
        // Detectar plataforma
        if (url.includes('youtube.com') || url.includes('youtu.be')) {
            return await downloadYouTube(url, outputPath, onProgress);
        } else if (url.includes('drive.google.com')) {
            return await downloadGoogleDrive(url, outputPath, onProgress);
        } else if (url.includes('mega.nz')) {
            return await downloadMega(url, outputPath, onProgress);
        } else if (url.match(/\.(mp4|mkv|avi|mov|webm)$/i)) {
            return await downloadDirect(url, outputPath, onProgress);
        } else {
            // Intentar descarga genérica
            return await downloadGeneric(url, outputPath, onProgress);
        }
    } catch (error) {
        console.error(`Error descargando ${url}:`, error.message);
        throw error;
    }
}

// Descarga de YouTube usando yt-dlp (mejor que youtube-dl)
async function downloadYouTube(url, outputPath, onProgress) {
    const ytDlpPath = './node_modules/.bin/yt-dlp';
    
    // Verificar si yt-dlp está instalado, si no, instalar
    try {
        await execPromise('which yt-dlp || npm install -g yt-dlp');
    } catch (e) {
        console.log('Usando yt-dlp local...');
    }
    
    const command = `yt-dlp -f "best[ext=mp4]" -o "${outputPath}" ${url}`;
    
    return new Promise((resolve, reject) => {
        exec(command, { maxBuffer: 1024 * 1024 * 100 }, (error, stdout, stderr) => {
            if (error) {
                reject(error);
            } else {
                resolve({ success: true, path: outputPath });
            }
        });
    });
}

// Descarga de Google Drive
async function downloadGoogleDrive(url, outputPath, onProgress) {
    try {
        // Extraer ID del archivo de Drive
        let fileId = null;
        const patterns = [
            /\/file\/d\/([^\/]+)/,
            /id=([^&]+)/,
            /\/d\/([^\/]+)/
        ];
        
        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match) {
                fileId = match[1];
                break;
            }
        }
        
        if (!fileId) {
            throw new Error('No se pudo extraer el ID de Google Drive');
        }
        
        // Usar API de Google Drive sin autenticación para archivos públicos
        const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
        
        const response = await axios({
            method: 'GET',
            url: downloadUrl,
            responseType: 'stream'
        });
        
        const writer = fs.createWriteStream(outputPath);
        let downloadedBytes = 0;
        const totalBytes = parseInt(response.headers['content-length'], 10);
        
        response.data.on('data', (chunk) => {
            downloadedBytes += chunk.length;
            if (onProgress && totalBytes) {
                onProgress((downloadedBytes / totalBytes) * 100);
            }
        });
        
        response.data.pipe(writer);
        
        return new Promise((resolve, reject) => {
            writer.on('finish', () => resolve({ success: true, path: outputPath }));
            writer.on('error', reject);
        });
    } catch (error) {
        throw new Error(`Error en Google Drive: ${error.message}`);
    }
}

// Descarga directa
async function downloadDirect(url, outputPath, onProgress) {
    try {
        const response = await axios({
            method: 'GET',
            url: url,
            responseType: 'stream',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        const writer = fs.createWriteStream(outputPath);
        let downloadedBytes = 0;
        const totalBytes = parseInt(response.headers['content-length'], 10);
        
        response.data.on('data', (chunk) => {
            downloadedBytes += chunk.length;
            if (onProgress && totalBytes) {
                onProgress((downloadedBytes / totalBytes) * 100);
            }
        });
        
        response.data.pipe(writer);
        
        return new Promise((resolve, reject) => {
            writer.on('finish', () => resolve({ success: true, path: outputPath }));
            writer.on('error', reject);
        });
    } catch (error) {
        throw new Error(`Error en descarga directa: ${error.message}`);
    }
}

// Descarga genérica
async function downloadGeneric(url, outputPath, onProgress) {
    try {
        const response = await axios({
            method: 'GET',
            url: url,
            responseType: 'stream',
            timeout: 30000
        });
        
        const writer = fs.createWriteStream(outputPath);
        response.data.pipe(writer);
        
        return new Promise((resolve, reject) => {
            writer.on('finish', () => resolve({ success: true, path: outputPath }));
            writer.on('error', reject);
        });
    } catch (error) {
        throw new Error(`Error en descarga genérica: ${error.message}`);
    }
}