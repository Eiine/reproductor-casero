import express from "express";
import path from "path";
import os from "os";
import serveIndex from "serve-index";
const PORT = 3000;
const app = express();


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
  "/video",
  express.static("video"),
  serveIndex("video", { icons: true })
);

app.listen(3000, "0.0.0.0",() => {
    const ip = getLocalIP();
  console.log(`Servidor local: http://localhost:${PORT}`);
  console.log(`Servidor red:   http://${ip}:${PORT} 🚀`);
});