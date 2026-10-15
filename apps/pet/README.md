# 桌面宠物（阶段 C）

透明置顶宠物 + 交互表情 + 旁侧聊天气泡 / 设置（OpenAI 兼容 API）。

## 本地运行

```bash
npm install
npm run build
npm start
```

## 配置 LLM

1. 右键宠物 → **设置**
2. 填写 **API Key**、**Base URL**（默认 `https://api.openai.com/v1`）、**模型**、**温度**
3. 保存后右键 → **打开聊天**，即可多轮问答

兼容 DeepSeek 等：Base URL 填提供商的 OpenAI 兼容地址（通常带 `/v1`）。

配置保存在本机 Electron `userData/desktop-pet-settings.json`。

## 交互摘要

| 操作 | 反馈 |
|------|------|
| 拖动 | drag |
| 单击 / 双击 | click / happy |
| 右键 | 菜单 |
| 发送消息 | think → talk → 回复结束开心一下 |

摘要 / 翻译仍为阶段 D 占位。
