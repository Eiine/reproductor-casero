// --- DOM ---
const listContainer = document.getElementById('list-container');
const playerContainer = document.getElementById('player-container');
const videoList = document.getElementById('video-list');
const videoPlayer = document.getElementById('main-player');
const backBtn = document.getElementById('back-btn');
const nowPlayingTitle = document.getElementById('now-playing');
const currentDirLabel = document.getElementById('current-dir');

// --- Estado original ---
let currentPath = '';

// --- 🆕 Estado para autoplay ---
let currentVideos = [];
let currentIndex = -1;

// --- Normalizador ---
const normalize = (name) => name.replace(/\s+/g, '_');

// --- Fullscreen ---
function requestFullscreen(element) {
    if (element.requestFullscreen) element.requestFullscreen();
    else if (element.webkitRequestFullscreen) element.webkitRequestFullscreen();
    else if (element.msRequestFullscreen) element.msRequestFullscreen();
}

function exitFullscreen() {
    if (document.exitFullscreen) document.exitFullscreen();
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    else if (document.msExitFullscreen) document.msExitFullscreen();
}

// --- Listener fullscreen ---
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

    if (!isFullscreen && playerContainer.style.display !== 'none') {
        console.log('Salió de pantalla completa, volviendo a la lista');
        exitPlayer();
    }
}

// --- Cargar contenido ---
async function loadVideos(path = '') {
    try {
        const url = path ? `/getVideos?path=${encodeURIComponent(path)}` : '/getVideos';
        const response = await fetch(url);
        const data = await response.json();

        if (currentDirLabel) {
            currentDirLabel.textContent = path || 'Raíz';
        }

        renderContent(data.folders, data.videos);

    } catch (error) {
        console.error("Error:", error);
        videoList.innerHTML = '<p style="color:red">Error al conectar con el servidor</p>';
    }
}

// --- Render ---
function renderContent(folders, videos) {
    videoList.innerHTML = '';

    // 🆕 guardar lista actual
    currentVideos = videos;

    // Subir nivel
    if (currentPath) {
        const upLi = document.createElement('li');
        upLi.className = 'folder-item up-folder';
        upLi.innerHTML = '📂 .. (subir nivel)';
        upLi.tabIndex = 0;
        upLi.onclick = goUp;
        upLi.onkeydown = (e) => { if (e.key === 'Enter') goUp(); };
        videoList.appendChild(upLi);
    }

    // Carpetas
    folders.forEach(folder => {
        const li = document.createElement('li');
        li.className = 'folder-item';
        li.innerHTML = `📁 ${folder.name}`;
        li.tabIndex = 0;
        li.onclick = () => enterFolder(folder.name);
        li.onkeydown = (e) => { if (e.key === 'Enter') enterFolder(folder.name); };
        videoList.appendChild(li);
    });

    // Videos
    videos.forEach((video, index) => {
        const li = document.createElement('li');
        li.tabIndex = 0;
        li.className = 'video-item';

        const img = document.createElement('img');
        img.src = `/thumbnails/${video.displayName}.jpg`;
        img.className = 'thumb-img';

        img.onerror = () => {
            img.style.display = 'none';
        };

        const title = document.createElement('div');
        title.className = 'video-title';
        title.textContent = video.displayName;

        li.appendChild(img);
        li.appendChild(title);

        // 🆕 pasar index
        li.onclick = () => startPlayer(video.name, index);
        li.onkeydown = (e) => {
            if (e.key === 'Enter') startPlayer(video.name, index);
        };

        videoList.appendChild(li);
    });

    if (folders.length === 0 && videos.length === 0) {
        const emptyMsg = document.createElement('li');
        emptyMsg.innerHTML = '<p style="color:#888">Carpeta vacía</p>';
        videoList.appendChild(emptyMsg);
    }

    const firstItem = videoList.querySelector('li');
    if (firstItem) firstItem.focus();
}

// --- Navegación ---
function enterFolder(folderName) {
    currentPath = currentPath ? `${currentPath}/${folderName}` : folderName;
    loadVideos(currentPath);
}

function goUp() {
    if (!currentPath) return;

    const segments = currentPath.split('/');
    segments.pop();
    currentPath = segments.join('/');

    loadVideos(currentPath);
}

// --- Player ---
function startPlayer(videoName, index = 0) {
    currentIndex = index;

    listContainer.style.display = 'none';
    playerContainer.style.display = 'block';

    const videoPath = currentPath ? `${currentPath}/${videoName}` : videoName;

    nowPlayingTitle.textContent = `Viendo: ${videoName}`;
    videoPlayer.src = `/playVideo/${encodeURIComponent(videoPath)}`;

    backBtn.focus();

    videoPlayer.play().catch(() => {
        console.log("Autoplay bloqueado");
    });

    setTimeout(() => {
        requestFullscreen(videoPlayer);
    }, 500);
}

// --- 🆕 siguiente automático ---
videoPlayer.addEventListener('ended', playNextVideo);

function playNextVideo() {
    if (!currentVideos.length) return;

    currentIndex++;

    if (currentIndex >= currentVideos.length) {
        console.log("Fin de la carpeta");
        exitPlayer(); // cambiar a loop si querés
        return;
    }

    const nextVideo = currentVideos[currentIndex];
    startPlayer(nextVideo.name, currentIndex);
}

// --- Salir ---
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
        exitFullscreen();
    }
};

// --- Init ---
setupFullscreenListener();
loadVideos();