import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { StatusBar, Style as BarStyle } from '@capacitor/status-bar';
import { Keyboard } from '@capacitor/keyboard';
import { useEffect } from 'react';

/**
 * 原生能力桥接层。
 *
 * 设计原则：所有能力在 Web 端静默降级为空操作，因此网页端 / Android 端共用同一份业务代码，
 * 不需要条件编译，也不会因为缺少原生插件而报错。
 */

export const isNative = (): boolean => Capacitor.isNativePlatform();
export const platformName = (): string => Capacitor.getPlatform(); // 'web' | 'android' | 'ios'

/* ------------------------------------------------------------ 触觉反馈 */

/** 答对 / 答错 / 中性操作 三类反馈，强度区分，让不看屏幕也能感知结果 */
export async function haptic(kind: 'ok' | 'bad' | 'tap'): Promise<void> {
  if (!isNative()) return;
  try {
    if (kind === 'ok') {
      await Haptics.notification({ type: NotificationType.Success });
    } else if (kind === 'bad') {
      await Haptics.notification({ type: NotificationType.Error });
    } else {
      await Haptics.impact({ style: ImpactStyle.Light });
    }
  } catch {
    /* 设备不支持震动时忽略 */
  }
}

/* ------------------------------------------------------------ 状态栏 */

/** 跟随应用主题切换状态栏与底部导航栏前景色，避免深色主题下出现黑底黑字 */
export async function syncStatusBar(theme: 'light' | 'dark'): Promise<void> {
  if (!isNative()) return;
  try {
    await StatusBar.setStyle({ style: theme === 'dark' ? BarStyle.Dark : BarStyle.Light });
    await StatusBar.setBackgroundColor({ color: theme === 'dark' ? '#17181a' : '#f7f4ee' });
  } catch {
    /* 插件不可用时忽略 */
  }
  // 原生导航栏没有 Capacitor 官方插件，由 MainActivity 暴露最小接口同步颜色
  const nav = (window as unknown as { KotobaNav?: { setDark: (dark: boolean) => void } }).KotobaNav;
  nav?.setDark(theme === 'dark');
}

/* ------------------------------------------------------------ 返回键 */

/**
 * Android 物理返回键处理。
 * handler 返回 true 表示「已消费」该事件（例如学习页先退出答题），返回 false 则交给系统退出应用。
 * 连续两次返回且未被消费时退出（常见的「再按一次退出」交互）。
 */
export function useAndroidBackButton(handler: () => boolean): void {
  useEffect(() => {
    if (!isNative()) return;
    let lastBack = 0;
    const sub = CapApp.addListener('backButton', () => {
      const consumed = handler();
      if (consumed) return;
      const t = Date.now();
      if (t - lastBack < 2000) {
        void CapApp.exitApp();
      } else {
        lastBack = t;
        window.dispatchEvent(new CustomEvent('kotoba:toast', { detail: '再按一次返回键退出' }));
      }
    });
    return () => {
      void sub.then((h) => h.remove());
    };
  }, [handler]);
}

/* ------------------------------------------------------------ 键盘 */

/** 提交拼写题或离开学习页时收起软键盘，避免键盘盖住反馈与导航 */
export async function hideKeyboard(): Promise<void> {
  if (!isNative()) return;
  try {
    await Keyboard.hide();
  } catch {
    /* 键盘未弹出或插件不可用时忽略 */
  }
}

/** 监听软键盘弹出，用于隐藏底部导航，避免答题按钮被遮挡 */
export function useKeyboardVisibility(onChange: (visible: boolean) => void): void {
  useEffect(() => {
    if (!isNative()) return;
    const show = Keyboard.addListener('keyboardWillShow', () => onChange(true));
    const hide = Keyboard.addListener('keyboardWillHide', () => onChange(false));
    return () => {
      void show.then((h) => h.remove());
      void hide.then((h) => h.remove());
    };
  }, [onChange]);
}

/* ------------------------------------------------------------ 前后台切换 */

/** 应用回到前台时刷新「现在」时间戳，保证跨天后队列立刻更新 */
export function useAppForeground(onResume: () => void): void {
  useEffect(() => {
    if (!isNative()) return;
    const sub = CapApp.addListener('appStateChange', (s) => {
      if (s.isActive) onResume();
    });
    return () => {
      void sub.then((h) => h.remove());
    };
  }, [onResume]);
}
