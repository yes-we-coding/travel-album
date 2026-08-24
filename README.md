# 行摄集 · 旅行相册

仓库驱动的静态相册（React + Vite，部署在 GitHub Pages）。照片存在仓库里，任何浏览器打开都能看到。

线上地址：<https://yes-we-coding.github.io/travel-album/>

## 添加照片（日常流程）

1. 把照片（.jpg / .jpeg / .png / .webp）放进 `public/photos/` 目录，建议文件名用拼音或英文
2. （可选）编辑 `public/photos/captions.json` 覆盖标题 / 描述 / 地点，格式：

   ```json
   {
     "xi'an.jpg": { "title": "西安城墙", "caption": "黄昏时分…", "place": "陕西·西安" }
   }
   ```

3. 运行部署：

   ```bash
   npm run deploy
   ```

   这一步会自动：读取每张照片的 EXIF（拍摄时间 / GPS 位置）、生成缩略图和大图、写描述文案（有 AI key 时用视觉模型，没有则用画面色彩分析兜底）、生成清单、构建并推送到 gh-pages 分支。

4. 等 1-2 分钟，Pages 更新后即可访问。

## 命令

| 命令                | 作用                            |
| ------------------- | ------------------------------- |
| `npm run manifest`  | 只生成清单 / 缩略图（不构建）   |
| `npm run build`     | 清单 + Vite 构建                |
| `npm run deploy`    | 构建 + 推送 gh-pages 分支       |
| `npm run dev`       | 本地开发（需先跑 manifest）     |
| `npm run preview`   | 预览构建产物                    |

## AI 描述（可选）

在运行 `npm run deploy` 之前设置环境变量，就会用视觉模型为每张照片写文案（结果有缓存，改过的照片不会重复调用）：

```bash
export TRAVEL_AI_BASE="https://dashscope.aliyuncs.com/compatible-mode/v1"
export TRAVEL_AI_KEY="***"
export TRAVEL_AI_MODEL="qwen-vl-max"
npm run deploy
```

不设置也能用，会用本地兜底方案（根据画面色彩 + 拍摄时间写文案）。

## 注意

- 源图会进 git 仓库，单张别太大（建议 < 8 MB），缩略图 / 大图是构建时生成的，不进仓库
- `captions.json` 的 key 必须和 `public/photos/` 里的文件名完全一致
- 想删照片：从 `public/photos/` 删掉文件 + 从 `captions.json` 删掉对应条目，再 deploy
