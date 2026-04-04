const listContainer = document.getElementById('list-container');
const playerContainer = document.getElementById('player-container');
const videoList = document.getElementById('video-list');
const videoPlayer = document.getElementById('main-player');
const backBtn = document.getElementById('back-btn');
const nowPlayingTitle = document.getElementById('now-playing');

// --- 1. Obtener la lista de videos al cargar la página ---
async function loadVideos() {
    try {
        const response = await fetch('/getVideos');
        const videos = await response.json(); // [{name, displayName, thumbnail}, ...]
        videoList.innerHTML = ''; 

        videos.forEach((video, index) => {
            const li = document.createElement('li');
            li.tabIndex = 0;

            // --- IMAGEN DE MINIATURA ---
            const img = document.createElement('img');
            img.src = video.thumbnail;
            img.className = 'thumb-img';
            
            img.onerror = () => { 
                img.style.display = 'none';
                li.classList.add('loading-thumb');
            };

            // --- TÍTULO ---
            const title = document.createElement('div');
            title.className = 'video-title';
            title.textContent = video.displayName;

            li.appendChild(img);
            li.appendChild(title);

            // --- EVENTOS ---
            li.onclick = () => startPlayer(video.name);
            li.onkeydown = (e) => { 
                if (e.key === 'Enter') startPlayer(video.name); 
            };

            videoList.appendChild(li);

            if (index === 0) li.focus();
        });
    } catch (error) {
        console.error("Error:", error);
        videoList.innerHTML = '<p style="color:red">Error al conectar con el servidor</p>';
    }
}

// --- 2. Función para mostrar el reproductor ---
function startPlayer(name) {
    // Ocultar la lista completamente
    listContainer.style.display = 'none';
    // Mostrar el reproductor
    playerContainer.style.display = 'block';
    
    // Cambiar el título
    nowPlayingTitle.textContent = `Viendo: ${name}`;
    
    // Setear la fuente del video
    videoPlayer.src = `/playVideo/${encodeURIComponent(name)}`;
    
    // Enfocar el botón de volver
    backBtn.focus();
    
    videoPlayer.play().catch(error => {
        console.log("La reproducción automática fue bloqueada, esperando interacción.");
    });
}

// --- 3. Función para regresar a la lista ---
function exitPlayer() {
    videoPlayer.pause();
    videoPlayer.src = ""; // Corta el stream inmediatamente
    // Ocultar reproductor
    playerContainer.style.display = 'none';
    // Mostrar lista
    listContainer.style.display = 'block';
    
    // Recuperar foco en el primer item de la lista
    const firstItem = videoList.querySelector('li');
    if (firstItem) firstItem.focus();
}

// --- Eventos de navegación ---
backBtn.onclick = () => exitPlayer();

window.onkeydown = (e) => {
    if (e.key === 'Escape' && playerContainer.style.display !== 'none') {
        exitPlayer();
    }
};

// --- Iniciar app ---
loadVideos();