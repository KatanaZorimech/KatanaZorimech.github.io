/**
 * 阶段 A 渲染进程：idle 动画由 CSS 驱动；拖拽由 -webkit-app-region: drag。
 * 点击 / 双击 / 右键 FSM 与聊天气泡留待阶段 B / C。
 */

const hint = document.querySelector<HTMLParagraphElement>(".pet-hint");
if (hint && window.desktopPet?.phase === "A") {
  hint.textContent = "按住拖动";
}

console.info("[桌面宠物] 阶段 A 已加载");
