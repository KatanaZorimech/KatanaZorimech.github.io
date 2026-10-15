import { contextBridge } from "electron";

/** 阶段 A：仅暴露只读元信息；拖拽由 CSS -webkit-app-region 完成 */
contextBridge.exposeInMainWorld("desktopPet", {
  phase: "A",
  locale: "zh-CN",
});
