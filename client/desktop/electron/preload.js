const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("petassist", {
  isDesk: true,
  pin: (id) => ipcRenderer.invoke("pet:pin", { id }),
  unpin: (id) => ipcRenderer.invoke("pet:unpin", { id }),
  pinAllTop: (ids, opts) =>
    ipcRenderer.invoke("pet:pin-all-top", {
      ids,
      confirm: opts?.confirm !== false,
    }),
  hideSticky: (id) => ipcRenderer.invoke("pet:hide", { id }),
  leapPet: (id, motion) => ipcRenderer.invoke("pet:leap", { id, motion }),
  showSticky: (id) => ipcRenderer.invoke("pet:show-sticky", { id }),
  resizeSticky: (id, mode) => ipcRenderer.invoke("pet:resize", { id, mode }),
  pinned: () => ipcRenderer.invoke("pet:pinned"),
  showDock: () => ipcRenderer.invoke("desk:show"),
  dragBegin: () => ipcRenderer.send("pet:drag-begin"),
  dragMove: () => ipcRenderer.send("pet:drag-move"),
  dragEnd: () => ipcRenderer.send("pet:drag-end"),
  followCursor: (id) => ipcRenderer.send("pet:follow-cursor", { id }),
  openDirectory: () => ipcRenderer.invoke("dialog:openDirectory"),
  notify: (opts) => ipcRenderer.invoke("desk:notify", opts),
  openPreview: (opts) => ipcRenderer.invoke("preview:open", opts),
  openUrl: (url) => ipcRenderer.invoke("desk:openUrl", { url }),
  screenshot: () => ipcRenderer.invoke("desk:screenshot"),
  micStatus: () => ipcRenderer.invoke("desk:micStatus"),
  requestMic: () => ipcRenderer.invoke("desk:requestMic"),
  openMicSettings: () => ipcRenderer.invoke("desk:openMicSettings"),
  onPinned: (cb) => {
    const listener = (_event, payload) => {
      if (Array.isArray(payload)) cb({ pinned: payload, hidden: [] });
      else cb(payload ?? { pinned: [], hidden: [] });
    };
    ipcRenderer.on("pet:pinned-changed", listener);
    return () => ipcRenderer.removeListener("pet:pinned-changed", listener);
  },
});
