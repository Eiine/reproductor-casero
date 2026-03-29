const listContainer = document.getElementById('list-container');
const playerContainer = document.getElementById('player-container');
const videoList = document.getElementById('video-list');
const videoPlayer = document.getElementById('main-player');
const backBtn = document.getElementById('back-btn');
const nowPlayingTitle = document.getElementById('now-playing');

// 1. Obtener la lista de videos al cargar la página
// 1. Obtener la lista de videos al cargar la página
async function loadVideos() {
    try {
        const response = await fetch('http://localhost:3000/getVideos');
        const videos = await response.json(); // Ahora recibimos [{name, displayName, thumbnail}, ...]
        
        videoList.innerHTML = ''; 

        videos.forEach((video, index) => {
            const li = document.createElement('li');
            li.tabIndex = 0;

            // --- IMAGEN DE MINIATURA ---
            const img = document.createElement('img');
            // Usamos la propiedad .thumbnail que viene del servidor
            img.src = video.thumbnail; 
            img.className = 'thumb-img';
            
            // Si la miniatura aún no existe (FFmpeg procesando), 
            // usamos un color de fondo o un placeholder local
            img.onerror = () => { 
                img.style.display = 'none'; // Ocultamos la imagen rota
                li.classList.add('loading-thumb'); // Podemos darle un estilo especial en CSS
            };

            // --- TÍTULO ---
            const title = document.createElement('div');
            title.className = 'video-title';
            // Usamos displayName para que se vea "Pelicula" en vez de "Pelicula.mkv"
            title.textContent = video.displayName; 

            li.appendChild(img);
            li.appendChild(title);

            // --- EVENTOS ---
            // IMPORTANTE: Al hacer clic usamos video.name (el nombre real con extensión)
            li.onclick = () => startPlayer(video.name);
            
            li.onkeydown = (e) => { 
                if (e.key === 'Enter') startPlayer(video.name); 
            };

            videoList.appendChild(li);
            
            // Foco automático al primer elemento para el control remoto
            if (index === 0) li.focus();
        });
    } catch (error) {
        console.error("Error:", error);
        videoList.innerHTML = '<p style="color:red">Error al conectar con el servidor</p>';
    }
}

// 2. Función para mostrar el reproductor
function startPlayer(name) {
    listContainer.classList.add('hidden');
    playerContainer.classList.remove('hidden');
    
    // Cambiamos el título
    nowPlayingTitle.textContent = `Viendo: ${name}`;
    
    // Seteamos la fuente del video (usando encodeURIComponent por si hay espacios)
    videoPlayer.src = `http://localhost:3000/playVideo/${encodeURIComponent(name)}`;
    
    // Enfocamos el botón de volver para que sea fácil salir con el control
    backBtn.focus();
    
    videoPlayer.play().catch(error => {
        console.log("La reproducción automática fue bloqueada, esperando interacción.");
    });
}

// 3. Función para regresar a la lista
backBtn.onclick = () => {
    exitPlayer();
};

// Soporte para tecla "Escape" o botón "Back" del control para salir
window.onkeydown = (e) => {
    if (e.key === 'Escape' && !playerContainer.classList.contains('hidden')) {
        exitPlayer();
    }
};

function exitPlayer() {
    videoPlayer.pause();
    videoPlayer.src = ""; // Corta el stream inmediatamente
    playerContainer.classList.add('hidden');
    listContainer.classList.remove('hidden');
    
    // Al volver, intentamos recuperar el foco en la lista
    const firstItem = videoList.querySelector('li');
    if (firstItem) firstItem.focus();
}

// Iniciar app
loadVideos();