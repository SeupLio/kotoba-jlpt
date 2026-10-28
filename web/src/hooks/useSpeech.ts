/**
 * 日语语音合成。
 *
 * 两条后端：
 * 1. Web（Chrome / Edge / Safari）：Web Speech API 的 speechSynthesis；
 * 2. Android（Capacitor）：WebView **不支持** speechSynthesis，必须走系统 TTS 引擎
 *    （@capacitor-community/text-to-speech → android.speech.tts.TextToSpeech）。
 *    这样即使设备没装日语语音包，也能给出明确的「请安装日语语音数据」提示，而不是静默失败。
 *
 * 对外只暴露 speak / stop / supported / ready，业务层无需关心平台差异。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { isNative } from '../platform/native';

let cachedVoice: SpeechSynthesisVoice | null = null;

function pickJaVoice(): SpeechSynthesisVoice | null {
  if (cachedVoice) return cachedVoice;
  const synth = window.speechSynthesis;
  if (!synth) return null;
  const voices = synth.getVoices?.() ?? [];
  const ja = voices.filter((v) => /ja(-|_)?JP/i.test(v.lang) || /japan/i.test(v.name));
  if (!ja.length) return null;
  const prefer =
    ja.find((v) => /google/i.test(v.name)) || ja.find((v) => /otoya|kyoko|nanami|sayaka/i.test(v.name)) || ja[0];
  cachedVoice = prefer;
  return prefer;
}

export function useSpeech(rate = 0.9) {
  const [supported, setSupported] = useState(false);
  const [ready, setReady] = useState(false);
  /** probing：还在探测；ok：可用；unavailable：无语音能力（应禁用听力题） */
  const [status, setStatus] = useState<'probing' | 'ok' | 'unavailable'>('probing');
  const [error, setError] = useState<string | null>(null);
  const rateRef = useRef(rate);
  rateRef.current = rate;

  useEffect(() => {
    if (isNative()) {
      // 原生端：探测系统是否安装了日语语音数据
      (async () => {
        try {
          const langs = await TextToSpeech.getSupportedLanguages();
          const hasJa = langs.languages.some((l) => /^ja/i.test(l));
          setSupported(true);
          setReady(true);
          setStatus(hasJa ? 'ok' : 'unavailable');
          if (!hasJa) {
            setError('系统未安装日语语音包，听力题型已隐藏。可在「设置 → 语言与输入 → 文字转语音」中安装日语数据');
          }
        } catch (e) {
          setSupported(false);
          setStatus('unavailable');
          setError(`语音引擎初始化失败：${(e as Error).message}`);
        }
      })();
      return;
    }

    const has = typeof window !== 'undefined' && 'speechSynthesis' in window;
    setSupported(has);
    setReady(has);
    setStatus(has ? 'ok' : 'unavailable');
    if (!has) setError('当前环境不支持语音合成，听力题型已隐藏');
    const synth = window.speechSynthesis;
    if (has && synth && typeof synth.getVoices === 'function') {
      synth.getVoices();
      const id = window.setTimeout(() => {
        pickJaVoice();
        setReady(true);
      }, 400);
      return () => window.clearTimeout(id);
    }
  }, []);

  const speak = useCallback(async (text: string, times = 1) => {
    if (!text) return;

    if (isNative()) {
      try {
        await TextToSpeech.stop();
        await TextToSpeech.speak({
          text,
          lang: 'ja-JP',
          rate: rateRef.current,
          pitch: 1.0,
          volume: 1.0,
          // 连续朗读多次时由原生侧排队，避免 Web 端 cancel 打断第一遍
          category: 'playback',
        });
        for (let i = 1; i < times; i++) {
          await TextToSpeech.speak({
            text,
            lang: 'ja-JP',
            rate: rateRef.current,
            pitch: 1.0,
            volume: 1.0,
            category: 'playback',
          });
        }
      } catch (e) {
        setStatus('unavailable');
        setError(`朗读失败：${(e as Error).message}，听力题型已隐藏`);
      }
      return;
    }

    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    for (let i = 0; i < times; i++) {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ja-JP';
      u.rate = rateRef.current;
      const v = pickJaVoice();
      if (v) u.voice = v;
      synth.speak(u);
    }
  }, []);

  const stop = useCallback(() => {
    if (isNative()) {
      void TextToSpeech.stop().catch(() => undefined);
      return;
    }
    window.speechSynthesis?.cancel();
  }, []);

  return { speak, stop, supported, ready, status, error };
}
