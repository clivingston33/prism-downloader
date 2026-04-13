import { autoUpdater, UpdateInfo } from "electron-updater";
import { BrowserWindow, app } from "electron";

let mainWindow: BrowserWindow | null = null;

export function setupUpdater() {
  autoUpdater.autoDownload = false;

  // Force dev update config when running from unpacked build (not from installer)
  if (!app.isPackaged) {
    autoUpdater.forceDevUpdateConfig = true;
  }

  autoUpdater.on("update-available", (info: UpdateInfo) => {
    if (mainWindow) {
      mainWindow.webContents.send("update:available", {
        version: info.version,
        releaseDate: info.releaseDate,
      });
    }
  });

  autoUpdater.on("update-downloaded", (info: UpdateInfo) => {
    if (mainWindow) {
      mainWindow.webContents.send("update:downloaded", {
        version: info.version,
      });
    }
  });

  autoUpdater.checkForUpdatesAndNotify();
}

export function setUpdaterMainWindow(window: BrowserWindow) {
  mainWindow = window;
}
