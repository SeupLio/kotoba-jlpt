import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor 配置：把同一套 Web 产物打包成 Android 应用。
 *
 * 关键点：
 * - webDir 指向 vite 的构建产物 dist，Android 端与网页端共用同一份代码；
 * - 资源通过 https 之外的本地 file 协议加载，因此 vite 必须用 base: './'（已在 vite.config.ts 设置）；
 * - 日语 TTS 由系统 TTS 引擎提供，与网页端的 Web Speech API 走同一个 useSpeech 抽象。
 */
const config: CapacitorConfig = {
  appId: 'io.github.seuplio.kotoba',
  appName: '言葉 Kotoba',
  webDir: 'dist',
  loggingBehavior: 'none',
  android: {
    // 允许在 Android 上通过 https 加载（本项目全部资源本地打包，不请求外网）
    allowMixedContent: false,
    // 输入法弹出时压缩视口而不是整体上推，避免答题按钮被顶出屏幕
    keyboardResize: 'body',
    buildOptions: {
      keystorePath: undefined,
    },
  },
  plugins: {
    // 隐藏启动闪屏前等待 JS 就绪，避免白屏
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: '#f7f4ee',
      showSpinner: false,
    },
  },
};

export default config;
