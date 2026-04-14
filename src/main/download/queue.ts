import { app } from "electron";
import path from "path";
import fs from "fs";
import { store } from "../store";
import { startDownload, getMetadata, cancelDownload } from "./ytdlp";

const ACTIVE_DOWNLOADS = new Map<string, { child: any; startedAt: number }>();
const MAX_CONCURRENT = 3;
const DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000;

function getBinPaths() {
  const platform = process.platform === "win32" ? "win" : "mac";
  const binDir = app.isPackaged
    ? path.join(process.resourcesPath, "bin", platform)
    : path.join(__dirname, "../../resources/bin", platform);

  return {
    ytdlp: path.join(
      binDir,
      process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp",
    ),
    ffmpeg: path.join(
      binDir,
      process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg",
    ),
    deno: path.join(binDir, process.platform === "win32" ? "deno.exe" : "deno"),
  };
}

class DownloadQueue {
  private activeCount = 0;

  constructor() {
    this.startTimeoutMonitor();
  }

  private startTimeoutMonitor() {
    setInterval(() => {
      const now = Date.now();
      for (const [id, data] of ACTIVE_DOWNLOADS.entries()) {
        if (now - data.startedAt > DOWNLOAD_TIMEOUT_MS) {
          console.log(
            `[queue] Download ${id} timed out after ${DOWNLOAD_TIMEOUT_MS}ms`,
          );
          this.cancel(id);
        }
      }
    }, 30000);
  }

  async add(options: any, mainWindow: any): Promise<string> {
    const id = Date.now().toString() + Math.random().toString(36).slice(2, 8);

    const item = {
      id,
      url: options.url,
      platform: "Unknown",
      title: options.url,
      format: options.format,
      quality: options.quality || "best",
      transcript: options.transcript,
      trimStart: options.trimStart,
      trimEnd: options.trimEnd,
      muteAudio: options.muteAudio,
      status: "pending",
      progress: 0,
      createdAt: new Date().toISOString(),
      retryCount: 0,
    };

    const history = store.get("history", []) as any[];
    store.set("history", [item, ...history]);

    getMetadata(options.url)
      .then((meta) => {
        const h = store.get("history", []) as any[];
        const i = h.findIndex((x: any) => x.id === id);
        if (i !== -1) {
          h[i].title = meta?.title || h[i].title;
          h[i].platform = meta?.platform || h[i].platform;
          h[i].thumbnail = meta?.thumbnail || h[i].thumbnail;
          if (h[i].quality === "best" && meta?.height) {
            h[i].quality = meta.height;
          }
          store.set("history", h);
          mainWindow.webContents.send("history:update", h);
        }
      })
      .catch(() => {});

    this.scheduleNext(mainWindow);
    return id;
  }

  private scheduleNext(mainWindow: any) {
    if (this.activeCount >= MAX_CONCURRENT) return;

    const history = store.get("history", []) as any[];
    const next = history.find(
      (h: any) => h.status === "pending" && !this.isActive(h.id),
    );

    if (next) {
      this.start(next.id, mainWindow);
    }
  }

  private isActive(id: string): boolean {
    return ACTIVE_DOWNLOADS.has(id);
  }

  async start(id: string, mainWindow: any) {
    const history = store.get("history", []) as any[];
    const item = history.find((h: any) => h.id === id);
    if (!item || this.isActive(id)) return;
    if (["downloading", "processing"].includes(item.status)) return;

    item.status = "pending";
    item.startedAt = Date.now();
    store.set("history", history);
    mainWindow.webContents.send("history:update", history);

    this.activeCount++;

    const { ffmpeg } = getBinPaths();
    if (!fs.existsSync(ffmpeg)) {
      console.log("[queue] ffmpeg not found, marking download as failed");
      const h = store.get("history", []) as any[];
      const i = h.findIndex((x: any) => x.id === id);
      if (i !== -1) {
        h[i].status = "failed";
        h[i].error =
          "ffmpeg not installed. Please install ffmpeg to download videos.";
        store.set("history", h);
        mainWindow.webContents.send("history:update", h);
        mainWindow.webContents.send("download:error", {
          id,
          error: h[i].error,
          retryCount: 0,
        });
      }
      this.activeCount--;
      this.scheduleNext(mainWindow);
      return;
    }

    const child = startDownload(item, mainWindow);
    ACTIVE_DOWNLOADS.set(id, { child, startedAt: Date.now() });

    child.finally(() => {
      ACTIVE_DOWNLOADS.delete(id);
      this.activeCount--;
      this.scheduleNext(mainWindow);
    });
  }

  cancel(id: string): boolean {
    const history = store.get("history", []) as any[];
    const item = history.find((h: any) => h.id === id);
    if (!item) return false;

    if (item.status === "pending") {
      store.set(
        "history",
        history.filter((h: any) => h.id !== id),
      );
      return true;
    }

    cancelDownload(id);
    ACTIVE_DOWNLOADS.delete(id);
    return true;
  }

  cancelAll() {
    for (const [id] of ACTIVE_DOWNLOADS) {
      this.cancel(id);
    }
  }

  getActiveCount(): number {
    return this.activeCount;
  }
}

export const queueManager = new DownloadQueue();
