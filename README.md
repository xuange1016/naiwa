# 奶蛙桌面宠物 / Naiwa Desktop Pet

一只会在桌面上活动的奶蛙。它没有普通窗口边框、始终置顶且不出现在任务栏；你可以把它拖到任意位置，并为每一只奶蛙分别设置大小、朝向和动作。

> 这是一个面向 Windows 的学习型桌面应用项目，使用 **Tauri 2 + TypeScript + Vite** 制作。

## 效果预览

点击奶蛙会从动作库随机播放完整动作；右键则会打开它自己的控制菜单。

<p align="center">
  <img src="public/demo.webp" alt="奶蛙桌面宠物动作演示：摇摆、跳舞等动作" width="360" />
</p>

> `demo.webp` 为仓库内的实际运行素材预览。若 GitHub 首次加载较慢，请稍候片刻；它比普通截图更能展示动作效果。

## 可以做什么

| 功能 | 说明 |
| --- | --- |
| 拖拽移动 | 按住并拖动任意奶蛙，将它放到桌面的任意位置。 |
| 随机动作 | 左键点击奶蛙，从动作库随机播放一个完整动作。 |
| 动作库 | 右键菜单可随机播放，或手动选择指定动作。 |
| 复制一只 | 复制出的奶蛙会继承当前奶蛙的尺寸与镜像状态。 |
| 独立状态 | 每个奶蛙都是单独窗口：移动位置、尺寸、镜像和当前动作都互不影响。 |
| 镜像翻转 | 单独翻转某一只奶蛙的左右朝向。 |
| 尺寸调整 | 支持超大号、大号、中号、小号、极小和迷你六档尺寸。 |
| 单只关闭 | 右键关闭当前这只，不影响桌面上的其他奶蛙。 |

当前动作库包含：**原始动作、待机摆动、前方摇摆、开怀大笑、图书馆舞步、背身扭扭舞**。

## 怎么玩

1. 启动应用后，桌面会出现一只奶蛙。
2. **左键点击**它：随机播放一个动作。
3. **右键点击**它：打开控制菜单。
4. 在菜单中可以选择：`动作库`、`尺寸设定`、`镜像翻转`、`再来一只` 或 `关闭这只奶蛙`。
5. 可以多复制几只；每一只都可以有不同的大小、方向和动作。

## 本地运行

### 环境要求

- Windows 10/11
- [Node.js](https://nodejs.org/)（建议 LTS 版本）
- Rust 工具链及 Tauri 在 Windows 上要求的构建环境。首次配置可参考 [Tauri Windows prerequisites](https://v2.tauri.app/start/prerequisites/)。

### 启动开发版

```powershell
git clone git@github.com:xuange1016/naiwa.git
cd naiwa
npm ci
npm run tauri:dev
```

若启动时报 `Port 1420 is already in use`，说明另一个开发服务仍在运行。先回到之前启动它的终端按 `Ctrl + C` 停止，再重新执行 `npm run tauri:dev`。

### 构建安装包

```powershell
npm run tauri:build
```

构建完成后，可在 `src-tauri/target/release/bundle/` 下找到 Windows 安装包或可执行产物。

## 项目结构

```text
src/                         前端交互、右键菜单与逐帧动作播放器
src-tauri/                   Tauri 原生窗口配置与 Rust 入口
public/pets/naiwa/           默认奶蛙的运行时帧与动作清单
public/actions/              动作库：每个动作的帧、音频与清单
scripts/                     视频/GIF 转透明帧素材的处理工具
assets/source-gifs/          本地原始 GIF（被忽略，不上传 GitHub）
public/demo.webp             README 使用的动作效果预览
```

每个动作目录（例如 `public/actions/idle-sway/`）包含：

- `manifest.json`：动作名称、画布尺寸、帧率、总帧数与资源路径；
- `frames/*.webp`：去除背景后的逐帧透明图片；
- `audio.m4a`：播放该动作时使用的音频（若动作配置了音频）。

## 添加自己的动作

把原始 GIF 放到 `assets/source-gifs/`，然后运行：

```powershell
npm run assets:action -- assets/source-gifs/your-action.gif your-action --name "我的新动作"
```

该命令会将 GIF 处理为应用可播放的透明帧与动作清单。生成的运行时资源位于 `public/actions/`；原始 GIF 不会被提交到 GitHub，避免仓库重复保存大文件。

若要重新处理默认奶蛙视频：

```powershell
npm run assets:naiwa
```

## 技术实现概览

- **Tauri 2**：创建透明、无边框、置顶且独立的原生桌面窗口；
- **TypeScript**：管理每只奶蛙的状态、右键菜单和交互逻辑；
- **Vite**：提供前端开发服务与构建；
- **WebP 逐帧播放**：按动作清单加载透明帧，形成完整动画；
- **HTML Audio**：在动作配置有音频时同步播放声音。

## 素材与许可说明

代码以 [MIT License](LICENSE) 发布。`public/actions/` 和 `public/pets/` 内的运行时角色图片、GIF 处理结果与音频会随仓库和安装包分发；在公开二次发布、商用或替换素材前，请自行确认拥有相应素材的使用与再发布权利。

欢迎提交 Issue 或 PR，一起给奶蛙增加更多动作和互动。
