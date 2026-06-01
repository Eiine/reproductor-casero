# Usamos una versión ligera de Node.js
FROM node:20-slim

# Directorio de trabajo dentro del contenedor
WORKDIR /app

# 🔧 INSTALACIÓN DE FFMPEG A NIVEL DE SISTEMA
# Actualizamos paquetes, instalamos ffmpeg y limpiamos la caché para que la imagen no pese de más
RUN apt-get update && apt-get install -y \
    ffmpeg \
    && apt-get clean \
    rm -rf /var/lib/apt/lists/*

# Copiamos los archivos de dependencias
COPY package*.json ./

# Instalamos las dependencias (aquí node-cron y ffmpeg-static bajarán sus componentes)
RUN npm install

# Copiamos el resto del código
COPY . .

# El puerto que usa tu app
EXPOSE 3000

# Comando para arrancar
CMD ["npm", "start"]