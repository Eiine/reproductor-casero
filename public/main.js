const listContainer = document.getElementById('list-container');
const playerContainer = document.getElementById('player-container');
const videoList = document.getElementById('video-list');
const videoPlayer = document.getElementById('main-player');
const backBtn = document.getElementById('back-btn');
const nowPlayingTitle = document.getElementById('now-playing');
const currentDirLabel = document.getElementById('current-dir');

// --- Normalizador (mismo que usa el backend) ---
const normalize = (name) => name.replace(/\s+/g, '_');

// --- Estado de navegación ---
let currentPath = '';  // ruta actual (ej: '', 'accion', 'accion/terror')

// --- 1. Cargar contenido según ruta ---
async function loadVideos(path = '') {
    try {
        const url = path ? `/getVideos?path=${encodeURIComponent(path)}` : '/getVideos';
        const response = await fetch(url);
        const data = await response.json();
        
        // Actualizar indicador de ubicación
        if (currentDirLabel) {
            currentDirLabel.textContent = path || 'Raíz';
        }
        
        renderContent(data.folders, data.videos);
        
    } catch (error) {
        console.error("Error:", error);
        videoList.innerHTML = '<p style="color:red">Error al conectar con el servidor</p>';
    }
}

// --- 2. Renderizar carpetas y videos ---
function renderContent(folders, videos) {
    videoList.innerHTML = '';
    
    // Botón para subir nivel
    if (currentPath) {
        const upLi = document.createElement('li');
        upLi.className = 'folder-item up-folder';
        upLi.innerHTML = '📂 .. (subir nivel)';
        upLi.tabIndex = 0;
        upLi.onclick = goUp;
        upLi.onkeydown = (e) => { if (e.key === 'Enter') goUp(); };
        videoList.appendChild(upLi);
    }
    
    // Renderizar carpetas (solo texto, sin miniatura)
    folders.forEach(folder => {
        const li = document.createElement('li');
        li.className = 'folder-item';
        li.innerHTML = `📁 ${folder.name}`;
        li.tabIndex = 0;
        li.onclick = () => enterFolder(folder.name);
        li.onkeydown = (e) => { if (e.key === 'Enter') enterFolder(folder.name); };
        videoList.appendChild(li);
    });
    
    // Renderizar videos (CON miniatura)
    videos.forEach((video) => {
        const li = document.createElement('li');
        li.tabIndex = 0;
        li.className = 'video-item';
        
        // Crear imagen de miniatura con nombre normalizado
        const img = document.createElement('img');
        const normalizedName = normalize(video.displayName);
        img.src = `/thumbnails/${normalizedName}.jpg`;
        img.className = 'thumb-img';
        
        img.onerror = () => { 
            img.style.display = 'none';
            console.log(`Miniatura no encontrada: /thumbnails/${normalizedName}.jpg`);
        };
        
        // Título del video (mostrar nombre original)
        const title = document.createElement('div');
        title.className = 'video-title';
        title.textContent = video.displayName;
        
        li.appendChild(img);
        li.appendChild(title);
        
        li.onclick = () => startPlayer(video.name);
        li.onkeydown = (e) => { if (e.key === 'Enter') startPlayer(video.name); };
        
        videoList.appendChild(li);
    });
    
    // Mensaje si no hay nada
    if (folders.length === 0 && videos.length === 0) {
        const emptyMsg = document.createElement('li');
        emptyMsg.innerHTML = '<p style="color:#888">Carpeta vacía</p>';
        videoList.appendChild(emptyMsg);
    }
    
    // Enfocar primer elemento
    const firstItem = videoList.querySelector('li');
    if (firstItem) firstItem.focus();
}

// --- 3. Entrar a una carpeta ---
function enterFolder(folderName) {
    currentPath = currentPath ? `${currentPath}/${folderName}` : folderName;
    loadVideos(currentPath);
}

// --- 4. Subir un nivel ---
function goUp() {
    if (!currentPath) return;
    
    // Quitar último segmento
    const segments = currentPath.split('/');
    segments.pop();
    currentPath = segments.join('/');
    
    loadVideos(currentPath);
}

// --- 5. Reproducir video ---
function startPlayer(videoName) {
    listContainer.style.display = 'none';
    playerContainer.style.display = 'block';
    
    // Ruta completa del video
    const videoPath = currentPath ? `${currentPath}/${videoName}` : videoName;
    
    nowPlayingTitle.textContent = `Viendo: ${videoName}`;
    videoPlayer.src = `/playVideo/${encodeURIComponent(videoPath)}`;
    
    backBtn.focus();
    
    videoPlayer.play().catch(error => {
        console.log("Reproducción automática bloqueada");
    });
}

// --- 6. Salir del reproductor ---
function exitPlayer() {
    videoPlayer.pause();
    videoPlayer.src = "";
    playerContainer.style.display = 'none';
    listContainer.style.display = 'block';
    
    const firstItem = videoList.querySelector('li');
    if (firstItem) firstItem.focus();
}

// --- Eventos ---
backBtn.onclick = () => exitPlayer();

window.onkeydown = (e) => {
    if (e.key === 'Escape' && playerContainer.style.display !== 'none') {
        exitPlayer();
    }
};

// --- Iniciar ---
loadVideos();