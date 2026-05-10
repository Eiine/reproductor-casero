import express from "express";
import { uploadMultipleVideos, getVideos,playVideo,uploadVideo } from "../controller/video.js";


// Ruta para subir un solo video (EXISTENTE
const router = express.Router();

// Ruta simple GET
router.get("/getVideos", getVideos);

// Ruta con parámetro
router.get("/playVideo/:videoName", playVideo);
router.post("/upload-video", uploadVideo);
router.post('/upload-multiple-videos', uploadMultipleVideos);
export default router;