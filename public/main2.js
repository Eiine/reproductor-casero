// Configuración
const UPLOAD_ENDPOINT = '/upload-video';
const DIRECTORY_ENDPOINT = '/getVideos';

// Estado global
let selectedFile = null;
let targetFolder = 'raiz';
let newFolderName = '';

// Elementos del DOM con validación
const getElement = (id) => document.getElementById(id);

// Inicializar elementos con null check
let uploadArea = getElement('uploadArea');
let videoInput = getElement('videoInput');
let fileInfo = getElement('fileInfo');
let fileName = getElement('fileName');
let fileSize = getElement('fileSize');
let uploadBtn = getElement('uploadBtn');
let progressContainer = getElement('progressContainer');
let progressFill = getElement('progressFill');
let progressStatus = getElement('progressStatus');
let messageDiv = getElement('message');
let existingFolders = getElement('existingFolders');
let newFolderInput = getElement('newFolderInput');
let folderSelect = getElement('folderSelect');
let newFolderNameInput = getElement('newFolderName');

// ==================== UTILIDADES ====================
function showMessage(text, type) {
    if (!messageDiv) {
        console.log(`${type}: ${text}`);
        return;
    }
    messageDiv.textContent = text;
    messageDiv.className = `message ${type}`;
    setTimeout(() => {
        if (messageDiv) messageDiv.className = 'message';
    }, 5000);
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// ==================== CARPETAS ====================
function setupFolderButtons() {
    const folderBtns = document.querySelectorAll('.folder-btn');
    if (folderBtns.length === 0) return;
    
    folderBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            folderBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const folderType = btn.dataset.folder;
            targetFolder = folderType;
            
            if (existingFolders) existingFolders.style.display = 'none';
            if (newFolderInput) newFolderInput.style.display = 'none';
            
            if (folderType === 'existente' && existingFolders) {
                existingFolders.style.display = 'block';
                loadFolders();
            } else if (folderType === 'nueva' && newFolderInput) {
                newFolderInput.style.display = 'block';
            }
            
            checkUploadReady();
        });
    });
}

function updateFolderSelect(folders) {
    if (!folderSelect) return;
    
    if (!folders || folders.length === 0) {
        folderSelect.innerHTML = '<option value="">No hay carpetas disponibles</option>';
        return;
    }
    
    folderSelect.innerHTML = '<option value="">Selecciona una carpeta...</option>' +
        folders.map(folder => `<option value="${folder.name}">📁 ${folder.name}</option>`).join('');
    
    folderSelect.onchange = () => {
        if (targetFolder === 'existente') {
            targetFolder = folderSelect.value;
            checkUploadReady();
        }
    };
}

// ==================== CARGAR SOLO CARPETAS ====================
async function loadFolders() {
    try {
        const response = await fetch(DIRECTORY_ENDPOINT);
        const data = await response.json();
        
        if (data && !data.error) {
            const folders = data.folders || [];
            updateFolderSelect(folders);
        } else if (data.error) {
            showMessage('Error al cargar las carpetas', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showMessage('Error de conexión al cargar las carpetas', 'error');
    }
}

// ==================== SUBIDA DE VIDEO ====================
function selectFile(file) {
    if (!file) return;
    
    const validExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.webm'];
    const extension = '.' + file.name.split('.').pop().toLowerCase();
    
    if (!validExtensions.includes(extension)) {
        showMessage(`Formato no soportado. Permitidos: ${validExtensions.join(', ')}`, 'error');
        return;
    }
    
    selectedFile = file;
    if (fileName) fileName.textContent = file.name;
    if (fileSize) fileSize.textContent = formatFileSize(file.size);
    if (fileInfo) fileInfo.classList.add('show');
    checkUploadReady();
}

function checkUploadReady() {
    if (!uploadBtn) return;
    
    if (!selectedFile) {
        uploadBtn.disabled = true;
        return;
    }
    
    let ready = true;
    
    if (targetFolder === 'existente') {
        const selected = folderSelect ? folderSelect.value : '';
        if (!selected || selected === '') {
            ready = false;
        } else {
            targetFolder = selected;
        }
    } else if (targetFolder === 'nueva') {
        const newName = newFolderNameInput ? newFolderNameInput.value.trim() : '';
        if (!newName) {
            ready = false;
        } else {
            newFolderName = newName;
        }
    }
    
    uploadBtn.disabled = !ready;
}

async function uploadVideo() {
    if (!selectedFile) {
        showMessage('Selecciona un video primero', 'error');
        return;
    }
    
    let finalFolder = targetFolder;
    if (targetFolder === 'nueva') {
        finalFolder = newFolderNameInput ? newFolderNameInput.value.trim() : '';
        if (!finalFolder) {
            showMessage('Por favor, ingresa un nombre para la carpeta', 'error');
            return;
        }
    } else if (targetFolder === 'existente') {
        finalFolder = folderSelect ? folderSelect.value : '';
        if (!finalFolder) {
            showMessage('Por favor, selecciona una carpeta', 'error');
            return;
        }
    } else if (targetFolder === 'raiz') {
        finalFolder = '';
    }
    
    const formData = new FormData();
    formData.append('video', selectedFile);
    formData.append('targetFolder', finalFolder);
    
    // DEBUG: Ver qué estamos enviando
    console.log('Enviando archivo:', selectedFile.name);
    console.log('Carpeta destino:', finalFolder);
    console.log('Tamaño:', selectedFile.size);
    
    if (uploadBtn) uploadBtn.disabled = true;
    if (progressContainer) progressContainer.style.display = 'block';
    if (progressFill) {
        progressFill.style.width = '0%';
        progressFill.textContent = '0%';
    }
    if (progressStatus) progressStatus.textContent = 'Subiendo...';
    
    try {
        // Usar fetch en lugar de XMLHttpRequest para mejor compatibilidad
        const response = await fetch(UPLOAD_ENDPOINT, {
            method: 'POST',
            body: formData
            // NO poner headers Content-Type - fetch lo setea automáticamente con el boundary
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showMessage(`✅ ${result.message}`, 'success');
            resetForm();
            loadFolders(); // Recargar carpetas
        } else {
            showMessage(`❌ Error: ${result.error}`, 'error');
        }
        
    } catch (error) {
        console.error('Error en subida:', error);
        showMessage(`❌ Error de conexión: ${error.message}`, 'error');
    } finally {
        if (uploadBtn) uploadBtn.disabled = false;
        setTimeout(() => {
            if (progressContainer) progressContainer.style.display = 'none';
            if (progressFill) progressFill.style.width = '0%';
        }, 2000);
    }
}

function resetForm() {
    selectedFile = null;
    if (fileInfo) fileInfo.classList.remove('show');
    if (videoInput) videoInput.value = '';
    if (newFolderNameInput) newFolderNameInput.value = '';
    targetFolder = 'raiz';
    
    const folderBtns = document.querySelectorAll('.folder-btn');
    folderBtns.forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.folder === 'raiz') {
            btn.classList.add('active');
        }
    });
    
    if (existingFolders) existingFolders.style.display = 'none';
    if (newFolderInput) newFolderInput.style.display = 'none';
    checkUploadReady();
}

// ==================== EVENTOS INICIALES ====================
function setupEventListeners() {
    // Área de subida
    if (uploadArea && videoInput) {
        uploadArea.addEventListener('click', () => videoInput.click());
        
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('drag-over');
        });
        
        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('drag-over');
        });
        
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('drag-over');
            const file = e.dataTransfer.files[0];
            if (file) {
                selectFile(file);
            }
        });
    }
    
    if (videoInput) {
        videoInput.addEventListener('change', (e) => {
            if (e.target.files[0]) {
                selectFile(e.target.files[0]);
            }
        });
    }
    
    if (newFolderNameInput) {
        newFolderNameInput.addEventListener('input', () => {
            checkUploadReady();
        });
    }
    
    if (uploadBtn) {
        uploadBtn.addEventListener('click', uploadVideo);
    }
}

// ==================== INICIALIZACIÓN ====================
function init() {
    const isUploadPage = !!getElement('uploadArea');
    
    if (isUploadPage) {
        console.log('Inicializando página de subida...');
        setupEventListeners();
        setupFolderButtons();
        loadFolders(); // Solo carga carpetas, no videos
    } else {
        console.log('No es la página de subida, omitiendo inicialización');
    }
}

// Iniciar cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}