# 🎬 FastVideosHome

**FastVideosHome** es un servidor multimedia ligero y de alto rendimiento diseñado para transformar una PC con recursos moderados (como una Acer Aspire 4741 con **Linux Mint** o sistemas **Windows**) en un centro de streaming privado. Permite visualizar, organizar y gestionar colecciones de video de forma inalámbrica a través de cualquier dispositivo en la red local.

---

## 🚀 Funcionalidades Principales

* **Interfaz tipo Smart TV:** Diseño responsivo con cuadrícula de posters, efectos visuales (glow púrpura) y navegación optimizada.
* **Generación Automática de Miniaturas:** Servicio inteligente (`pick.js`) que utiliza **FFmpeg** para capturar automáticamente un fotograma del video y usarlo como poster.
* **Garbage Collector (GC):** Servicio de mantenimiento (`gc.js`) que detecta y elimina automáticamente miniaturas "huérfanas" de videos borrados.
* **Acceso por Nombre de Red (mDNS):** Acceso simplificado mediante `http://fastvideos.local:3000` sin necesidad de recordar direcciones IP.
* **Subida Remota (Upload):** Endpoint integrado con **Multer** para centralizar videos desde móviles u otras PCs directamente al servidor.
* **Compatibilidad Multiplataforma:** Arquitectura agnóstica de sistema operativo (Rutas dinámicas para Linux/Windows).

---

## 🛠️ Tecnologías Utilizadas

* **Backend:** Node.js, Express.
* **Procesamiento de Video:** FFmpeg (vía `ffmpeg-static`).
* **Networking:** `bonjour-service` (mDNS/ZeroConf).
* **Gestión de Archivos:** Multer y módulos nativos `fs` y `path`.
* **Frontend:** HTML5, CSS3 (Variables y Grid), JavaScript Vanilla.

---

## 📦 Instalación y Configuración

1.  **Clonar el repositorio:**
    ```bash
    git clone <url-del-repositorio>
    cd fastvideoshome
    ```

2.  **Instalar dependencias:**
    *(Esto descargará el binario de FFmpeg correcto para tu arquitectura y OS).*
    ```bash
    npm install
    ```

3.  **Estructura de Directorios:**
    El sistema requiere la siguiente estructura base para funcionar:
    ```text
    fastvideoshome/
    ├── public/
    │   └── thumbnails/    # Generadas automáticamente
    ├── videos/            # Coloca tus archivos de video aquí
    ├── src/
    └── package.json
    ```

4.  **Iniciar el servidor:**
    ```bash
    npm start
    ```

---

## 🖥️ Uso del Sistema

1.  Asegúrate de que el dispositivo esté en la misma red Wi-Fi que el servidor.
2.  Ingresa a `http://fastvideos.local:3000` en tu navegador.
3.  **Reproducción:** Haz clic o presiona `Enter` sobre un video para iniciar el streaming.
4.  **Gestión:** Utiliza el apartado de subida para añadir contenido nuevo sin necesidad de cables.

---

## 🗺️ Roadmap (Próximos Pasos)

Actualmente el proyecto se encuentra en fase de expansión de capacidades de biblioteca:

- [ ] **Escaneo Recursivo:** Implementación de búsqueda profunda para detectar videos en subcarpetas de cualquier nivel.
- [ ] **Buscador de Carpetas:** Interfaz visual para filtrar y encontrar directorios específicos rápidamente.
- [ ] **Optimización de Rutas:** Refuerzo de la lógica `path.join` para garantizar estabilidad total entre sistemas de archivos EXT4 y NTFS.

---

> **FastVideosHome** - *Simplicidad y control total para tu biblioteca multimedia personal.*
