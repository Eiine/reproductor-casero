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

// --- Función para solicitar pantalla completa ---
function requestFullscreen(element) {
    if (element.requestFullscreen) {
        element.requestFullscreen();
    } else if (element.webkitRequestFullscreen) { // Safari
        element.webkitRequestFullscreen();
    } else if (element.msRequestFullscreen) { // IE/Edge
        element.msRequestFullscreen();
    }
}

// --- Función para salir de pantalla completa ---
function exitFullscreen() {
    if (document.exitFullscreen) {
        document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
    } else if (document.msExitFullscreen) {
        document.msExitFullscreen();
    }
}

// --- Detectar cuando se sale de pantalla completa ---
function setupFullscreenListener() {
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('msfullscreenchange', handleFullscreenChange);
}

function handleFullscreenChange() {
    const isFullscreen = !!(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.msFullscreenElement
    );
    
    // Si NO estamos en pantalla completa Y el reproductor está visible
    if (!isFullscreen && playerContainer.style.display !== 'none') {
        console.log('Salió de pantalla completa, volviendo a la lista');
        exitPlayer();
    }
}

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
        img.src = `/thumbnails/${video.displayName}.jpg`;
        img.className = 'thumb-img';
        
        img.onerror = () => { 
            img.style.display = 'none';
            console.log(`Miniatura no encontrada: /thumbnails/${video.displayName}.jpg`);
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

// --- 5. Reproducir video con pantalla completa automática ---
function startPlayer(videoName) {
    listContainer.style.display = 'none';
    playerContainer.style.display = 'block';
    
    // Ruta completa del video
    const videoPath = currentPath ? `${currentPath}/${videoName}` : videoName;
    
    nowPlayingTitle.textContent = `Viendo: ${videoName}`;
    videoPlayer.src = `/playVideo/${encodeURIComponent(videoPath)}`;
    
    backBtn.focus();
    
    // 🎯 REPRODUCIR Y ACTIVAR PANTALLA COMPLETA AUTOMÁTICAMENTE
    videoPlayer.play().catch(error => {
        console.log("Reproducción automática bloqueada");
    });
    
    // Esperar un momento para que el video cargue y luego pantalla completa
    setTimeout(() => {
        requestFullscreen(videoPlayer);
    }, 500);
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

// Manejar tecla ESC: sale del reproductor Y de pantalla completa
window.onkeydown = (e) => {
    if (e.key === 'Escape' && playerContainer.style.display !== 'none') {
        exitPlayer();
        // También salir de pantalla completa por si acaso
        exitFullscreen();
    }
};

// --- Iniciar listeners ---
setupFullscreenListener();
loadVideos();