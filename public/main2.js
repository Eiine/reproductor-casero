// Configuración
const UPLOAD_ENDPOINT = '/upload-video';
const MULTIPLE_UPLOAD_ENDPOINT = '/upload-multiple-videos';
const DIRECTORY_ENDPOINT = '/getVideos';

// Estado global
let selectedFile = null;
let targetFolder = 'raiz';
let newFolderName = '';

// Estado para carga masiva de carpetas
let massiveFileList = [];
let massiveTargetFolder = 'raiz';
let massiveNewFolderName = '';

// Elementos del DOM con validación
const getElement = (id) => document.getElementById(id);

// Inicializar elementos existentes
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

// Elementos para carga masiva
let folderUploadArea = getElement('folderUploadArea');
let folderInput = getElement('folderInput');
let uploadFolderBtn = getElement('uploadFolderBtn');
let folderFileList = getElement('folderFileList');
let fileListContent = getElement('fileListContent');
let massiveProgressContainer = getElement('massiveProgressContainer');
let massiveProgressFill = getElement('massiveProgressFill');
let massiveProgressStatus = getElement('massiveProgressStatus');
let massiveFileProgress = getElement('massiveFileProgress');

// Elementos para pestañas
let massiveUrlsTab = getElement('massiveUrlsTab');
let massiveFolderTab = getElement('massiveFolderTab');
let urlsPanel = getElement('urlsPanel');
let folderPanel = getElement('folderPanel');

// Elementos de carpetas para carga masiva
let massiveExistingFolders = getElement('massiveExistingFolders');
let massiveFolderSelect = getElement('massiveFolderSelect');
let massiveNewFolderInput = getElement('massiveNewFolderInput');
let massiveNewFolderNameInput = getElement('massiveNewFolderName');

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

// ==================== CARPETAS (Individual) ====================
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

// ==================== SUBIDA DE VIDEO INDIVIDUAL ====================
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
    if (!selectedFile) return;
    
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
    
    if (uploadBtn) uploadBtn.disabled = true;
    if (progressContainer) progressContainer.style.display = 'block';
    if (progressFill) {
        progressFill.style.width = '0%';
        progressFill.textContent = '0%';
    }
    if (progressStatus) progressStatus.textContent = 'Subiendo...';
    
    const xhr = new XMLHttpRequest();
    
    xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && progressFill && progressStatus) {
            const percentComplete = (e.loaded / e.total) * 100;
            const percentRounded = Math.round(percentComplete);
            progressFill.style.width = percentComplete + '%';
            progressFill.textContent = percentRounded + '%';
            progressStatus.textContent = `Subiendo video... ${percentRounded}% (${formatFileSize(e.loaded)} de ${formatFileSize(e.total)})`;
        }
    });
    
    xhr.onload = () => {
        if (xhr.status === 200) {
            try {
                const response = JSON.parse(xhr.responseText);
                showMessage(`✅ ${response.message || 'Video subido exitosamente'}`, 'success');
                resetForm();
                if (typeof loadFolders === 'function') loadFolders();
            } catch (e) {
                showMessage('✅ Video subido exitosamente', 'success');
                resetForm();
            }
        } else {
            try {
                const response = JSON.parse(xhr.responseText);
                showMessage(`❌ Error: ${response.error || 'Error desconocido'}`, 'error');
            } catch {
                showMessage(`❌ Error ${xhr.status}: No se pudo subir el video`, 'error');
            }
        }
        if (uploadBtn) uploadBtn.disabled = false;
        setTimeout(() => {
            if (progressContainer) progressContainer.style.display = 'none';
            if (progressFill) progressFill.style.width = '0%';
        }, 2000);
    };
    
    xhr.onerror = () => {
        showMessage('❌ Error de conexión con el servidor', 'error');
        if (uploadBtn) uploadBtn.disabled = false;
        if (progressContainer) progressContainer.style.display = 'none';
    };
    
    xhr.open('POST', UPLOAD_ENDPOINT, true);
    xhr.send(formData);
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

// ==================== CARGA MASIVA DE CARPETAS ====================
function setupMassiveTabs() {
    if (!massiveUrlsTab || !massiveFolderTab) return;
    
    massiveUrlsTab.addEventListener('click', () => {
        massiveUrlsTab.classList.add('active');
        massiveUrlsTab.style.background = '#9d4edd';
        massiveFolderTab.classList.remove('active');
        massiveFolderTab.style.background = '#555';
        if (urlsPanel) urlsPanel.style.display = 'block';
        if (folderPanel) folderPanel.style.display = 'none';
    });
    
    massiveFolderTab.addEventListener('click', () => {
        massiveFolderTab.classList.add('active');
        massiveFolderTab.style.background = '#9d4edd';
        massiveUrlsTab.classList.remove('active');
        massiveUrlsTab.style.background = '#555';
        if (urlsPanel) urlsPanel.style.display = 'none';
        if (folderPanel) folderPanel.style.display = 'block';
        loadMassiveFolders();
    });
}

function setupMassiveFolderButtons() {
    const folderBtns = document.querySelectorAll('.massive-folder-btn');
    if (folderBtns.length === 0) return;
    
    folderBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            folderBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const folderType = btn.dataset.massiveFolder;
            massiveTargetFolder = folderType;
            
            if (massiveExistingFolders) massiveExistingFolders.style.display = 'none';
            if (massiveNewFolderInput) massiveNewFolderInput.style.display = 'none';
            
            if (folderType === 'existente' && massiveExistingFolders) {
                massiveExistingFolders.style.display = 'block';
                loadMassiveFolders();
            } else if (folderType === 'nueva' && massiveNewFolderInput) {
                massiveNewFolderInput.style.display = 'block';
            }
            
            checkMassiveUploadReady();
        });
    });
}

async function loadMassiveFolders() {
    try {
        const response = await fetch(DIRECTORY_ENDPOINT);
        const data = await response.json();
        
        if (data && !data.error && massiveFolderSelect) {
            const folders = data.folders || [];
            if (folders.length === 0) {
                massiveFolderSelect.innerHTML = '<option value="">No hay carpetas disponibles</option>';
            } else {
                massiveFolderSelect.innerHTML = '<option value="">Selecciona una carpeta...</option>' +
                    folders.map(folder => `<option value="${folder.name}">📁 ${folder.name}</option>`).join('');
            }
            
            massiveFolderSelect.onchange = () => {
                if (massiveTargetFolder === 'existente') {
                    massiveTargetFolder = massiveFolderSelect.value;
                    checkMassiveUploadReady();
                }
            };
        }
    } catch (error) {
        console.error('Error al cargar carpetas:', error);
    }
}

function setupFolderUpload() {
    if (!folderUploadArea || !folderInput) return;
    
    folderUploadArea.addEventListener('click', () => folderInput.click());
    
    folderInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files);
        // Filtrar solo archivos de video
        const videoExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.webm'];
        massiveFileList = files.filter(file => {
            const ext = '.' + file.name.split('.').pop().toLowerCase();
            return videoExtensions.includes(ext);
        });
        
        if (massiveFileList.length === 0) {
            showMessage('No se encontraron archivos de video en la carpeta seleccionada', 'error');
            return;
        }
        
        // Mostrar lista de archivos
        if (folderFileList && fileListContent) {
            folderFileList.style.display = 'block';
            fileListContent.innerHTML = massiveFileList.map(file => `
                <div class="file-item">
                    🎬 ${file.name} (${formatFileSize(file.size)})
                </div>
            `).join('');
            fileListContent.innerHTML += `<div class="total-count">Total: ${massiveFileList.length} videos</div>`;
        }
        
        checkMassiveUploadReady();
    });
}

function checkMassiveUploadReady() {
    if (!uploadFolderBtn) return;
    
    if (massiveFileList.length === 0) {
        uploadFolderBtn.disabled = true;
        return;
    }
    
    let ready = true;
    
    if (massiveTargetFolder === 'existente') {
        const selected = massiveFolderSelect ? massiveFolderSelect.value : '';
        if (!selected || selected === '') {
            ready = false;
        } else {
            massiveTargetFolder = selected;
        }
    } else if (massiveTargetFolder === 'nueva') {
        const newName = massiveNewFolderNameInput ? massiveNewFolderNameInput.value.trim() : '';
        if (!newName) {
            ready = false;
        } else {
            massiveNewFolderName = newName;
        }
    }
    
    uploadFolderBtn.disabled = !ready;
}

async function uploadCompleteFolder() {
    if (massiveFileList.length === 0) {
        showMessage('No hay archivos para subir', 'error');
        return;
    }
    
    let finalFolder = massiveTargetFolder;
    if (massiveTargetFolder === 'nueva') {
        finalFolder = massiveNewFolderNameInput ? massiveNewFolderNameInput.value.trim() : '';
        if (!finalFolder) {
            showMessage('Por favor, ingresa un nombre para la carpeta', 'error');
            return;
        }
    } else if (massiveTargetFolder === 'existente') {
        finalFolder = massiveFolderSelect ? massiveFolderSelect.value : '';
        if (!finalFolder) {
            showMessage('Por favor, selecciona una carpeta', 'error');
            return;
        }
    } else if (massiveTargetFolder === 'raiz') {
        finalFolder = '';
    }
    
    // Mostrar barra de progreso
    if (massiveProgressContainer) massiveProgressContainer.style.display = 'block';
    if (uploadFolderBtn) uploadFolderBtn.disabled = true;
    
    if (massiveProgressFill) {
        massiveProgressFill.style.width = '0%';
        massiveProgressFill.textContent = '0%';
    }
    if (massiveProgressStatus) massiveProgressStatus.textContent = 'Preparando carga masiva...';
    if (massiveFileProgress) massiveFileProgress.textContent = `0 de ${massiveFileList.length} archivos`;
    
    let completed = 0;
    let failed = [];
    const totalFiles = massiveFileList.length;
    
    // Subir archivo por archivo con progreso individual
    for (let i = 0; i < totalFiles; i++) {
        const file = massiveFileList[i];
        const currentFileNumber = i + 1;
        
        // Actualizar estado
        if (massiveProgressStatus) {
            massiveProgressStatus.textContent = `Subiendo archivo ${currentFileNumber} de ${totalFiles}`;
        }
        if (massiveFileProgress) {
            massiveFileProgress.textContent = `📹 ${file.name} (${formatFileSize(file.size)}) - Archivo ${currentFileNumber} de ${totalFiles}`;
        }
        
        // Crear FormData para este archivo
        const formData = new FormData();
        formData.append('video', file);
        formData.append('targetFolder', finalFolder);
        
        // Usar XMLHttpRequest para tener progreso individual por archivo
        const xhr = new XMLHttpRequest();
        
        // Promesa para manejar la subida de cada archivo
        const uploadPromise = new Promise((resolve, reject) => {
            // Progreso de subida del archivo actual
            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                    const filePercent = (e.loaded / e.total) * 100;
                    const totalPercent = ((currentFileNumber - 1) / totalFiles) * 100 + (filePercent / totalFiles);
                    
                    if (massiveProgressFill) {
                        massiveProgressFill.style.width = totalPercent + '%';
                        massiveProgressFill.textContent = Math.round(totalPercent) + '%';
                    }
                    if (massiveFileProgress) {
                        massiveFileProgress.innerHTML = `📹 ${file.name}<br>⬆️ Subiendo: ${Math.round(filePercent)}% (${formatFileSize(e.loaded)} de ${formatFileSize(e.total)})<br>📊 Progreso general: ${Math.round(totalPercent)}% - Archivo ${currentFileNumber} de ${totalFiles}`;
                    }
                }
            });
            
            xhr.onload = () => {
                if (xhr.status === 200) {
                    try {
                        const response = JSON.parse(xhr.responseText);
                        resolve(response);
                    } catch (e) {
                        resolve({ success: true });
                    }
                } else {
                    reject(new Error(`Error ${xhr.status}`));
                }
            };
            
            xhr.onerror = () => reject(new Error('Error de conexión'));
            
            xhr.open('POST', UPLOAD_ENDPOINT, true);
            xhr.send(formData);
        });
        
        // Esperar que termine la subida del archivo actual
        try {
            const result = await uploadPromise;
            completed++;
            
            // Actualizar progreso después del archivo completado
            const totalPercent = (currentFileNumber / totalFiles) * 100;
            if (massiveProgressFill) {
                massiveProgressFill.style.width = totalPercent + '%';
                massiveProgressFill.textContent = Math.round(totalPercent) + '%';
            }
            if (massiveFileProgress) {
                massiveFileProgress.innerHTML = `✅ Completado: ${file.name}<br>📊 Progreso: ${Math.round(totalPercent)}% (${currentFileNumber} de ${totalFiles} archivos)`;
            }
            
            console.log(`✅ Subido: ${file.name}`);
            
        } catch (error) {
            failed.push({ name: file.name, error: error.message });
            console.error(`❌ Falló: ${file.name}`, error);
            
            // Mostrar error en el progreso
            if (massiveFileProgress) {
                massiveFileProgress.innerHTML = `❌ Falló: ${file.name}<br>${error.message}<br>Continuando con el siguiente archivo...`;
            }
        }
        
        // Pequeña pausa entre archivos para no sobrecargar el servidor
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Mostrar resultado final
    const totalPercent = 100;
    if (massiveProgressFill) {
        massiveProgressFill.style.width = '100%';
        massiveProgressFill.textContent = '100%';
    }
    
    let message = '';
    if (completed === totalFiles) {
        message = `✅ ¡ÉXITO TOTAL! Se subieron todos los ${completed} videos correctamente`;
        if (massiveProgressStatus) massiveProgressStatus.textContent = '✅ ¡Carga completada exitosamente!';
        showMessage(message, 'success');
    } else if (completed > 0) {
        message = `⚠️ SUBIDA PARCIAL: ${completed} de ${totalFiles} videos subidos correctamente. Fallaron ${failed.length}.`;
        if (massiveProgressStatus) massiveProgressStatus.textContent = '⚠️ Carga completada con errores parciales';
        showMessage(message, 'warning');
        console.log('Archivos fallidos:', failed);
    } else {
        message = `❌ ERROR TOTAL: No se pudo subir ningún video. Verifica tu conexión.`;
        if (massiveProgressStatus) massiveProgressStatus.textContent = '❌ Error en la carga';
        showMessage(message, 'error');
    }
    
    // Limpiar UI después de 4 segundos
    setTimeout(() => {
        if (massiveProgressContainer) massiveProgressContainer.style.display = 'none';
        if (uploadFolderBtn) uploadFolderBtn.disabled = false;
        if (massiveProgressFill) massiveProgressFill.style.width = '0%';
        
        // Limpiar selección solo si todo salió bien
        if (completed === totalFiles) {
            massiveFileList = [];
            if (folderInput) folderInput.value = '';
            if (folderFileList) folderFileList.style.display = 'none';
            if (fileListContent) fileListContent.innerHTML = '';
        }
        
        // Recargar listas de carpetas
        loadFolders();
        loadMassiveFolders();
    }, 4000);
}

// ==================== EVENTOS INICIALES ====================
function setupEventListeners() {
    // Área de subida individual
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

function setupMassiveEventListeners() {
    if (uploadFolderBtn) {
        uploadFolderBtn.addEventListener('click', uploadCompleteFolder);
    }
    
    if (massiveNewFolderNameInput) {
        massiveNewFolderNameInput.addEventListener('input', checkMassiveUploadReady);
    }
}

// ==================== INICIALIZACIÓN ====================
function init() {
    const isUploadPage = !!getElement('uploadArea');
    
    if (isUploadPage) {
        console.log('Inicializando página de subida...');
        setupEventListeners();
        setupFolderButtons();
        loadFolders();
        
        // Inicializar funcionalidades de carga masiva
        setupMassiveTabs();
        setupMassiveFolderButtons();
        setupFolderUpload();
        setupMassiveEventListeners();
        loadMassiveFolders();
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