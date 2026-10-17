# 行摄集 · 旅行相册

仓库驱动的静态相册（React + Vite，部署在 GitHub Pages）。照片存在仓库里，任何浏览器打开都能看到。

线上地址：<https://yes-we-coding.github.io/travel-album/>

特性：博客流 + 年月时间线分节、LQIP 模糊占位、WebP 缩略图/大图、灯箱（键盘导航、`#photo=id` 直链分享）、浏览器端上传/删除（Git Data API 单 commit，冲突自动重试）、AI 描述文案（可选）。

## 添加照片

**方式一：网页上传（日常）**

打开线上地址 →「设置」填 GitHub token（Fine-grained，仓库 Contents: Read and write）→ 拖照片进页面。照片会以单个 commit 提交进仓库，Actions 自动构建部署，页面检测到更新后自动刷新。

**方式二：本地提交**

1. 把照片（.jpg / .jpeg / .png / .webp）放进 `public/photos/`，建议文件名用拼音或英文
2. （可选）大图先压缩入库，省仓库体积：

   ```bash
   npm run compress   # 长边 >3000px 或 >2MB 的源图重编码为 JPEG q88（保留 EXIF）
   ```

3. （可选）编辑 `public/photos/captions.json` 覆盖标题 / 描述 / 地点，key 必须和文件名完全一致：

   ```json
   {
     "xi'an.jpg": { "title": "西安城墙", "caption": "黄昏时分…", "place": "陕西·西安" }
   }
   ```

4. 提交并推送 `main` 分支，GitHub Actions 自动构建并部署 Pages（约 1-2 分钟）：

   ```bash
   git add public/photos && git commit -m "相册：添加照片" && git push
   ```

   构建会自动：读取每张照片的 EXIF（拍摄时间 / GPS）、生成 WebP 缩略图 / 大图 / LQIP、写描述文案（有 AI key 时用视觉模型，没有则用画面色彩分析兜底）、生成清单。

## 命令

| 命令               | 作用                                 |
| ------------------ | ------------------------------------ |
| `npm run dev`      | 本地开发（需先跑 manifest）          |
| `npm run manifest` | 只生成清单 / 缩略图 / LQIP（不构建） |
| `npm run build`    | 清单 + Vite 构建                     |
| `npm run compress` | 压缩 `public/photos/` 里的超大源图   |
| `npm run lint`     | oxlint 检查                          |
| `npm run preview`  | 预览构建产物                         |

部署 = push 到 `main`，由 `.github/workflows/deploy.yml` 完成构建与发布。

## AI 描述（可选）

构建前设置环境变量，就会用视觉模型为每张照片写文案（按内容哈希缓存，照片不变不重复调用）：

```bash
export TRAVEL_AI_BASE="https://dashscope.aliyuncs.com/compatible-mode/v1"
export TRAVEL_AI_KEY="***"
export TRAVEL_AI_MODEL="qwen-vl-max"
npm run build
```

不设置也能用，会用本地兜底方案（根据画面色彩 + 拍摄时间写文案，按文件名做种子，同一照片文案稳定）。

## 注意

- 源图会进 git 仓库；入库前建议先 `npm run compress`（缩略图 / 大图 / LQIP 是构建产物，不进仓库）
- 想删照片：网页灯箱里点「删除这张」（单 commit 自动同步），或从 `public/photos/` 删掉文件 + `captions.json` 删掉对应条目后 push
