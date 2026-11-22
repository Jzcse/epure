# Epure

> A lightweight vector diagram editor for math and physics figures, built to run inside WPS Office.

Epure 是一个轻量级矢量示意图编辑器，面向学生和教师在 WPS 文字里绘制数学、物理示意图（定位上是 AxGlyph 的免费平替）。编辑器用网页技术实现，作为 WPS 加载项运行：在文档里点“插入示意图”打开编辑器，画完插入；以后选中这张图，点“编辑示意图”可以继续修改。

## 下载安装

到 [Releases](https://github.com/Jzcse/epure/releases) 下载 `Epure-Setup-<版本>.exe`，双击安装即可：

- 仅支持 Windows 上的 **WPS Office**（在 WPS 12.1 个人版上开发和测试）。
- 按当前用户安装，不需要管理员权限，不需要联网。
- 安装包没有代码签名，Windows 可能提示“未知发布者”，点“更多信息 → 仍要运行”。
- 安装后重启 WPS，新建或打开一个文字文档，功能区出现“Epure 示意图”选项卡。WPS 首次加载时可能询问是否信任此加载项，选“信任”。
- 卸载：“设置 → 应用”中找到“Epure 示意图”。

## 当前状态

| 项目 | 状态 |
|---|---|
| 独立网页版编辑器 | ✅ 可用，交互测试 35 项全部通过 |
| WPS 加载项（开发方式：本地网址） | ✅ 已在 WPS 12.1 中验证：插入、再编辑、弹窗尺寸 |
| WPS 安装包（本地文件加载，不需要网址） | ⚠️ 安装、升级、卸载、登记已验证；**WPS 实际加载本地加载项尚在验证中**，发布为 pre-release |
| Word 加载项 | ⏸ 暂停。代码保留在仓库中，发行版不包含，不再维护 |

## 功能

- **绘图**：直线、箭头、双向箭头、虚线、自由画笔（自动平滑）；矩形、正方形、椭圆、圆、三角形、直角三角形、平行四边形、梯形、菱形、正五/六边形；文字、公式。Shift 约束角度（15°）或等比。
- **公式文本**：`x^2` 上标、`v_0` 下标、`\alpha` 希腊字母、`\vec{F}` 矢量、`\Delta`、`\rm{N}` 正体、`\frac{a}{b}`、`\sqrt{x}`；字母自动斜体。
- **样式**：线色、线宽、5 种线型、7 种箭头（起点/终点可分别设置）、纯色/斜线/网格/点阵/球面渐变填充、不透明度、字体字号颜色、粗斜体。
- **对象操作**：点选、Shift 多选、框选、拖动、缩放、旋转、复制/粘贴/剪切/副本、方向键微调、置顶/置底、6 种对齐、水平/垂直翻转、撤销/重做。
- **骨架与吸附**：线段端点/中点，矩形角点/边中点/中心，椭圆中心/象限点，多边形顶点/边中点。绘制、拖动线段端点、移动对象时自动吸附，被吸附的关键点高亮显示；选中对象时显示其全部关键点；按住 Alt 临时关闭吸附。
- **图层**：新建、删除、重命名、显示/隐藏、锁定、上移/下移、把选中对象移到当前图层。隐藏图层不导出、不插入文档，但随文档保存，再次编辑时完整恢复。
- **无限画布**：右键（或中键）拖动平移，滚轮缩放，Ctrl+0 显示全部；插入和导出按图形实际范围自动裁剪。
- **文件**：本地保存/打开（`.epure.json`），导出 SVG 和 PNG。
- **界面**：画布、图标化操作栏、分类对象栏（示意图图块，悬停显示名称和说明）、右侧“属性/图层”选项卡（未选中对象时属性卡不可用）。

### 快捷键

V 选择 · L 直线 · A 箭头 · R 矩形 · E 椭圆 · P 画笔 · T 文字 · F 公式 · Ctrl+S 保存 · Ctrl+O 打开 · Ctrl+A 全选 · Ctrl+D 副本 · Ctrl+Z / Ctrl+Y 撤销/重做 · Del 删除 · `[` `]` 层级 · Ctrl+0 显示全部 · Ctrl+= / Ctrl+- 缩放 · Alt 关闭吸附 · Ctrl+Enter / Esc 结束文字编辑

## 快速开始（开发）

需要 Windows、Node.js 18+、pnpm。

```bash
pnpm install
pnpm dev            # 独立网页版：https://localhost:3000（无开发证书时为 http）
pnpm build          # 类型检查 + 生产构建到 dist/
```

### 在 WPS 中调试（本地网址方式）

```bash
pnpm start          # 构建并启动静态服务：http://127.0.0.1:3001（WPS）、https://localhost:3000（Word）
pnpm register       # 写入 %APPDATA%\kingsoft\wps\jsaddons\publish.xml（网址加载项，带 JS 调试器按钮）
pnpm unregister     # 注销
```

保持 `pnpm start` 运行，重启 WPS，功能区会出现“Epure 示意图”选项卡。首次加载时 WPS 会询问是否信任，选“信任”。

### 测试

```bash
pnpm dev                                               # 先启动开发服务器
node tests/e2e.mjs https://localhost:3000/index.html   # 交互测试，Edge 无头模式模拟鼠标键盘
```

- `tests/e2e.mjs` 用 Edge 的 DevTools 协议驱动，无额外依赖；Edge 路径写在文件开头，需要时修改。
- `tests/smoke.html`：导出 SVG/PNG、数据编码往返的冒烟测试，浏览器打开 `/tests/smoke.html` 查看。
- 发行版编辑器也可以直接用 `file://` 打开，用同一套交互测试验证。

## 发行版（WPS 安装包）

```bash
pnpm release        # 构建 release/addin，并用 Inno Setup 生成 release/Epure-Setup-<版本>.exe
```

- 版本号取自 `package.json` 的 `version`。Inno Setup 默认路径 `D:\Application\Builder\Inno Setup 7\ISCC.exe`，可用环境变量 `ISCC` 指定。
- 安装包按当前用户安装（不需要管理员权限）：加载项文件放到 `%APPDATA%\kingsoft\wps\jsaddons\epure_<版本>\`，并在同目录 `publish.xml` 中登记 `<jsplugin>` 条目（合并写入，保留其他加载项；也会清理开发方式留下的条目，避免出现两个选项卡）。
- 发行版只含 WPS 相关代码（构建常量 `__WPS_ONLY__`）；脚本打包为经典脚本（非 ES 模块），可从本地文件直接运行，不依赖任何服务器；功能区只有“插入示意图”“编辑示意图”两个按钮，没有 JS 调试器。
- `publish.xml` 里的 `url="http://127.0.0.1/..."` 只是格式要求的占位字段，没有任何服务监听这个地址。
- 图标：`installer/icon.ico`，由 `node tools/make-icon.mjs` 从 `public/assets/icon.svg` 生成。
- 安装包没有代码签名，Windows 可能提示“未知发布者”。

## 工作原理

- **插入**：编辑器生成 SVG（带 PNG 回退），并把完整源数据（JSON → deflate → base64，前缀 `EPUREz:`）写入图片的“可选文字（Alt Text）”。WPS 端先把图片写到临时文件，再用 `InlineShapes.AddPicture` 插入，优先 SVG，失败回退 PNG。
- **再编辑**：读取选中图片的可选文字 → 解码 → 在编辑器中打开 → 原位替换，并保留你在文档里调整过的缩放比例。
- **隐藏图层**：只存在于可选文字里的源数据中，不进入图片。
- **弹窗尺寸**：WPS 加载项主页面在后台隐藏运行，`screen.*` 恒为 1×1、`devicePixelRatio` 恒为 1，不可用。因此按 WPS 主窗口尺寸（`Application.Width/Height`，单位磅）计算，且不小于编辑器最小尺寸 1100×680。

## 项目结构

```
.
├─ index.html               编辑器页面（开发：独立 / ?host=wps / ?host=office）
├─ src/
│  ├─ main.ts               入口：识别宿主、绑定界面、载入待编辑数据
│  ├─ types.ts              数据模型（Shape、Layer、EpureDoc）
│  ├─ editor.ts             交互状态机：工具、选择、拖动、图层、无限画布、快捷键
│  ├─ tools.ts              绘图工具注册表（对象栏由此生成；新增对象在这里登记）
│  ├─ snap.ts               对象骨架（关键点）与吸附计算
│  ├─ shapes.ts             图形 → SVG 标记（线型、箭头、填充图案）；编辑与导出共用
│  ├─ mathtext.ts           公式标记 → SVG 文本、文字测量
│  ├─ geometry.ts           几何计算、命中测试、缩放
│  ├─ render.ts             画布渲染：选择框、手柄、关键点高亮
│  ├─ history.ts            撤销/重做（快照式，连续调整自动合并）
│  ├─ io.ts                 保存/打开、SVG/PNG 导出、插入数据包
│  ├─ doc.ts                文档序列化、可选文字编码/解码
│  ├─ ui.ts                 操作栏、对象栏、属性/图层面板、悬停提示
│  ├─ icons.ts              自绘 SVG 图标
│  ├─ util.ts               通用工具
│  ├─ style.css             样式
│  ├─ host/                 宿主适配（standalone / wps / office）与窗口最小尺寸
│  ├─ wps/                  WPS：功能区回调（main.ts）、文档操作（api.ts）
│  └─ office/               Word（暂停维护）：任务窗格、OOXML 插入、消息协议
├─ public/
│  ├─ assets/               图标（SVG + 多尺寸 PNG）
│  └─ wps/                  ribbon.xml（WPS 功能区）与按钮图标
├─ wps/index.html           WPS 加载项主页（开发方式）
├─ office/                  Word 加载项清单与任务窗格页面（暂停维护）
├─ installer/               Inno Setup 脚本（epure.iss）与安装程序图标
├─ tools/
│  ├─ build-release.mjs     构建发行版并打包安装程序
│  ├─ register.mjs          注册/注销开发用加载项
│  ├─ serve.mjs             开发用静态服务（3000 / 3001）
│  └─ make-icon.mjs         生成 icon.ico
├─ tests/                   e2e.mjs（交互测试）、smoke.html / smoke.ts（冒烟测试）
├─ vite.config.ts           构建配置（开发版；发行版由 tools/build-release.mjs 单独构建）
└─ package.json
```

`dist/`、`release/`、`tests/out/` 是构建与测试产物，已被 `.gitignore` 忽略。

## 数据格式

文档为 JSON（`.epure.json`，也是写入图片可选文字的内容）：

```jsonc
{
  "format": "epure",
  "version": 2,
  "shapes": [ { "id": "…", "kind": "line|rect|ellipse|path|text", "layer": "L1", "x": 0, "y": 0, "w": 0, "h": 0, "rot": 0, "…": "样式与点集" } ],
  "layers": [ { "id": "L1", "name": "图层 1", "visible": true, "locked": false } ],  // 下标 0 在最底层
  "size": { "w": 540, "h": 254 }   // 仅插入文档时记录，用于再编辑时保持缩放比例
}
```

## 已知限制

- Word 暂不支持（见上）。
- 仅在 WPS 12.1 个人版上验证；教育版、企业版、旧版本未测试。
- 吸附目前只对准关键点，还没有“吸到线上任意位置”和对齐参考线。
- 文字没有关键点；多对象还不能组合。
- 完整的学科元件库（坐标轴、力学、电路、几何标注）尚未开始。

## 路线图

1. 在真实 WPS 中确认安装包的本地加载；必要时调整加载项登记方式。
2. 组合、对齐参考线、对齐与分布。
3. 学科元件库：坐标轴、力学（斜面、弹簧、滑轮、小车）、电路元件、几何标注（角度、尺寸）。
