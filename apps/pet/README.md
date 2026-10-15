# 桌面宠物（阶段 A）

透明置顶无边框 Electron 窗口 + idle 动画占位角色 + 拖拽 + 系统托盘。

## 本地运行

在仓库根目录：

```bash
npm install
npm run build
npm start
```

或进入本目录：

```bash
cd apps/pet
npm install   # 若未在根目录装过
npm run build
npm start
```

开发时改代码后重新 `npm run build && npm start`。

## 打包安装包

```bash
# 当前平台目录产物
npm run pack -w @desktop-pet/pet

# 安装包（macOS → dmg/zip，Windows → nsis；需在对应 OS 上构建）
npm run dist -w @desktop-pet/pet
```

产物在 `apps/pet/release/`。

## 托盘

- **显示宠物 / 隐藏宠物**
- **退出**

用户界面文案为简体中文。

## 阶段边界

本阶段 **不包含**：LLM 聊天、选区摘要/翻译、点击/双击/右键完整 FSM。
