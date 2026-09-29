# 本地源素材

`source-gifs/` 用于保存你自己收集的原始 GIF。该目录已被 Git 忽略，避免把重复的原始文件上传到 GitHub；应用运行真正需要的透明帧和清单位于 `public/actions/`，会正常提交。

处理新动作的示例：

```sh
npm run assets:action -- assets/source-gifs/your-action.gif your-action --name "动作名称"
```
