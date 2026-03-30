import express from "express";
import path from "path";
import os from "os";
import serveIndex from "serve-index";
import { fileURLToPath } from "url";
import videoRouter from "./src/router/videoRouter.js";
import cors from "cors";

const PORT = 3000;
const app = express();
app.use(cors());

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "localhost";
}


app.use(
  "/",
  express.static("public")
);
app.use(videoRouter)

app.get("/getVideos", (req, res) => {
  const videoFolder = path.join(__dirname, "videos");

  let videos = [];
  try {
    videos = fs.readdirSync(videoFolder).filter(f => f.endsWith(".mp4"));
  } catch (err) {
    return res.status(500).json({ error: "No se pudo leer la carpeta de videos" });
  }

  res.json(videos);
});



app.listen(PORT, "0.0.0.0", () => {
  const ip = getLocalIP();
  console.log(`Servidor local: http://localhost:${PORT}`);
  console.log(`Servidor red:   http://${ip}:${PORT} 🚀`);
});