/// <reference types="vite/client" />

/** 构建常量（vite.config.ts / tools/build-release.mjs 中 define） */
/** 发行版仅支持 WPS（不打包 Word 加载项相关代码） */
declare const __WPS_ONLY__: boolean;
/** WPS 加载项主页面 → 编辑器页面的相对地址 */
declare const __EDITOR_URL__: string;
declare const __APP_VERSION__: string;
