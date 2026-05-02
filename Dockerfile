# Usamos una versión ligera de Node.js
FROM node:20-slim

# Directorio de trabajo dentro del contenedor
WORKDIR /app

# Copiamos los archivos de dependencias
COPY package*.json ./

# Instalamos las dependencias
RUN npm install

# Copiamos el resto del código
COPY . .

# El puerto que usa tu app (ejemplo 3000)
EXPOSE 3000

# Comando para arrancar
CMD ["npm", "start"]