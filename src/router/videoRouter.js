import express from "express";
import { getVideos,playVideo } from "../controller/video.js";
const router = express.Router();

// Ruta simple GET
router.get("/getVideos", getVideos);

// Ruta con parámetro
router.get("/playVideo/:videoName", playVideo);

export default router;