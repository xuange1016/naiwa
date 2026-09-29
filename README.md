# Naiwa Desktop Pet

一只支持拖拽、缩放、镜像、复制、单独关闭与动作库的奶蛙桌面宠物。使用 **Tauri 2 + TypeScript + Vite** 构建，当前面向 Windows 开发。

## 功能

- 左键点击随机播放一段完整动作。
- 右键打开菜单，按需播放指定动作。
- 每只奶蛙都是独立窗口：尺寸、镜像状态和播放状态互不影响。
- 支持复制、镜像翻转、调整尺寸与单独关闭。
- 内置原始动作、待机摆动、前方摇摆、开怀大笑、图书馆舞步和背身扭扭舞。

## 开始使用

```sh
npm ci
npm run tauri:dev
```

启动后，右键任意奶蛙可打开 **动作库**、**尺寸设定**、镜像、复制与关闭等操作。

## 常用命令

```sh
# 类型检查并构建前端
npm run build

# 启动桌面开发程序
npm run tauri:dev

# 构建桌面安装包
npm run tauri:build

# 从根目录的原始视频重新生成默认动作
npm run assets:naiwa

# 将本地 GIF 处理成一个完整的桌面动作
npm run assets:action -- assets/source-gifs/your-action.gif your-action --name "动作名称"
```

## 目录说明

```text
src/                 前端交互与动作播放器
src-tauri/           Tauri 原生窗口配置
public/pets/         默认宠物的运行时素材
public/actions/      动作库的运行时帧、音频与清单（提交到 Git）
scripts/             默认宠物与 GIF 动作的素材处理工具
assets/source-gifs/  本地原始 GIF，便于再处理（不提交到 Git）
```

每个 `public/actions/<action-id>/` 目录都包含：

- `manifest.json`：动作名称、帧率、总帧数与资源路径。
- `frames/*.webp`：透明背景的动作帧。
- `audio.m4a`：该动作播放时使用的音频。

## 发布前提示

`public/actions/` 中的素材会随代码发布。公开仓库或分发安装包前，请确认你拥有这些角色图片、GIF 与音频素材的再发布权利。
