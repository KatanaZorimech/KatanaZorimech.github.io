# KatanaZorimech.github.io

KatanaZorimech / DaoDao 的个人主页（GitHub Pages）。

## 旅行地图云端同步

足迹与照片保存在仓库内，任意浏览器打开站点即可浏览：

- 数据：`data/travel-trips.json`
- 照片：`assets/travel/`

### 站长写入（录入 / 编辑 / 删除）

1. 打开 GitHub → **Settings** → **Developer settings** → **Personal access tokens**
2. 创建 **Fine-grained token**，仅勾选本仓库，权限 **Contents: Read and write**
3. 打开网站「旅行地图」→ 粘贴 Token → **连接并启用写入**
4. Token 只存在于当前浏览器的 `localStorage`，不会提交进仓库
5. 若本机浏览器里还有旧足迹，可点 **发布本机足迹到云端** 一次上传

写入后 GitHub Pages 通常需数十秒完成部署，其他设备刷新即可看到。
