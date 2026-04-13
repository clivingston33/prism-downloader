import { ipcMain, dialog, BrowserWindow } from "electron";
import { store, defaultSettings } from "../store";
import { autoUpdater } from "electron-updater";

export function setupSettingsIPC() {
  ipcMain.handle("settings:get", () => {
    return store.get("settings", defaultSettings);
  });

  ipcMain.handle("settings:update", (_, partialSettings) => {
    const current = store.get("settings", defaultSettings) as any;
    const updated = { ...current, ...partialSettings };
    store.set("settings", updated);
    return updated;
  });

  ipcMain.handle("settings:selectDirectory", async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return null;
    const result = await dialog.showOpenDialog(window, {
      properties: ["openDirectory"],
    });
    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0];
    }
    return null;
  });

  ipcMain.handle("settings:checkForUpdates", async () => {
    try {
      console.log("[updater] Checking for updates...");
      const result = await autoUpdater.checkForUpdates();
      console.log("[updater] checkForUpdates result:", JSON.stringify(result));
      if (result?.updateInfo?.version) {
        return {
          version: result.updateInfo.version,
          releaseDate: result.updateInfo.releaseDate,
          releaseNotes: result.updateInfo.releaseNotes,
        };
      }
      console.log("[updater] No update available");
      return null;
    } catch (err: any) {
      console.error("[updater] Update check failed:", err.message, err.stack);
      return { error: err.message };
    }
  });

  ipcMain.handle("settings:downloadUpdate", async () => {
    try {
      autoUpdater.downloadUpdate();
    } catch (err) {
      console.error("Update download failed:", err);
    }
  });
}
