import { useState } from 'react';
import type { Level, Settings } from '../core/types';
import { LEVELS } from '../core/types';
import { dateKey } from '../core/srs';
import { IconCheck, IconClose } from '../components/icons';
import { BrandLockup, LogoMark } from '../components/Brand';

const LEVEL_DESC: Record<Level, string> = {
  N5: '入门 · 基础助词与日常表达',
  N4: '基础 · 日常会话与简单阅读',
  N3: '进阶 · 新闻与工作场景入门',
  N2: '中高级 · 长文阅读与抽象表达',
  N1: '高级 · 学术与书面语',
};

const DAILY_OPTIONS = [10, 20, 30, 50];

interface Props {
  settings: Settings;
  onDone: (patch: Partial<Settings>) => void;
  onCancel?: () => void;
}

export function Onboarding({ settings, onDone, onCancel }: Props) {
  const [step, setStep] = useState(0);
  const [levels, setLevels] = useState<Level[]>(settings.levels.length ? settings.levels : ['N5']);
  const [newPerDay, setNewPerDay] = useState(settings.newPerDay || 20);
  const [examDate, setExamDate] = useState(settings.examDate);

  const toggleLevel = (lv: Level) => {
    setLevels((prev) => {
      const has = prev.includes(lv);
      if (has) return prev.length > 1 ? prev.filter((x) => x !== lv) : prev;
      return LEVELS.filter((x) => x === lv || prev.includes(x));
    });
  };

  const finish = () => {
    onDone({ onboarded: true, levels, newPerDay, examDate });
  };

  return (
    <div className="onboard">
      <aside className="onboard-aside" aria-hidden="true">
        <div className="aside-brand">
          <LogoMark size={46} />
          <div>
            <div className="aside-name">言葉 Kotoba</div>
            <div className="aside-sub">JLPT 词汇训练器</div>
          </div>
        </div>
        <div className="aside-title">
          把 JLPT 词汇
          <br />
          真正记进长期记忆
        </div>
        <div className="onboard-points">
          <div>
            <IconCheck size={16} /> N5–N1 分级词库，只学你选的等级
          </div>
          <div>
            <IconCheck size={16} /> 连续答对 + 跨天验证，拒绝「假熟练」
          </div>
          <div>
            <IconCheck size={16} /> 艾宾浩斯复习，配 9 种看听说写题型
          </div>
          <div>
            <IconCheck size={16} /> 完全离线，无账号，学习记录只留在本机
          </div>
        </div>
        <div className="aside-foot">
          <span>7,811 词 · N5–N1</span>
          <span>本地存储 · 无需账号</span>
        </div>
      </aside>

      <div className="onboard-panel">
        <div className="onboard-top">
          <div className="onboard-brand">
            <BrandLockup size={30} sub="JLPT 词汇训练器" />
          </div>
          {onCancel ? (
            <button className="btn sm ghost" onClick={onCancel} type="button" aria-label="关闭引导">
              <IconClose size={16} />
            </button>
          ) : (
            <button className="btn sm ghost" onClick={finish} type="button">
              跳过
            </button>
          )}
        </div>

        <div className="onboard-dots" aria-label={`第 ${step + 1} / 3 步`}>
          {[0, 1, 2].map((i) => (
            <i key={i} className={i <= step ? 'on' : ''} />
          ))}
        </div>

        <div className="onboard-body">
          {step === 0 && (
            <>
              <div className="onboard-hero">
                <div className="onboard-logo">
                  <LogoMark size={74} />
                  <span className="onboard-wordmark">言葉</span>
                </div>
                <div className="onboard-tagline">
                  把 JLPT 词汇
                  <br />
                  真正记进长期记忆
                </div>
                <div className="onboard-points">
                  <div>
                    <IconCheck size={16} /> N5–N1 分级词库，只学你选的等级
                  </div>
                  <div>
                    <IconCheck size={16} /> 连续答对 + 跨天验证，拒绝「假熟练」
                  </div>
                  <div>
                    <IconCheck size={16} /> 艾宾浩斯复习，配 9 种看听说写题型
                  </div>
                  <div>
                    <IconCheck size={16} /> 完全离线，无账号，学习记录只留在本机
                  </div>
                </div>
                <div className="onboard-sample">
                  <div className="sample-top">
                    <span className="sample-kicker">今日一词</span>
                    <span className="tag">N5</span>
                  </div>
                  <div className="sample-word">勉強</div>
                  <div className="sample-reading">べんきょう</div>
                  <div className="sample-gloss">
                    <b>学习；用功</b>
                    <span>study</span>
                  </div>
                  <div className="sample-foot">先认识它，隔几个词再回来测验。</div>
                </div>
              </div>
              <div className="onboard-intro">
                <div className="onboard-eyebrow">开始之前</div>
                <div className="onboard-title">
                  三步完成设置
                  <br />
                  今天就开始积累
                </div>
                <div className="onboard-sub">
                  选择等级、每日词量与考试日期。所有记录只保存在本机，之后随时可以调整。
                </div>
                <div className="onboard-facts">
                  <div>
                    <b className="mono">7,811</b>
                    <span>N5–N1 词条</span>
                  </div>
                  <div>
                    <b className="mono">9 种</b>
                    <span>看听说写题型</span>
                  </div>
                  <div>
                    <b className="mono">3 次</b>
                    <span>连续答对才算熟练</span>
                  </div>
                </div>
              </div>
            </>
          )}

        {step === 1 && (
          <div>
            <div className="onboard-title">你准备考哪一级？</div>
            <div className="onboard-sub">可以多选；只会推送所选等级的词汇</div>
            <div className="level-picks">
              {LEVELS.map((lv) => {
                const on = levels.includes(lv);
                return (
                  <button
                    key={lv}
                    className={`level-pick${on ? ' on' : ''}`}
                    onClick={() => toggleLevel(lv)}
                    type="button"
                    aria-pressed={on}
                  >
                    <span className="level-pick-lv">{lv}</span>
                    <span className="level-pick-desc">{LEVEL_DESC[lv]}</span>
                    {on && (
                      <span className="level-pick-check">
                        <IconCheck size={14} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="onboard-title" style={{ marginTop: 26 }}>
              每天学多少新词？
            </div>
            <div className="onboard-sub">能坚持比一次学很多更重要，之后可随时调整</div>
            <div className="daily-picks">
              {DAILY_OPTIONS.map((n) => (
                <button
                  key={n}
                  className={`daily-pick${newPerDay === n ? ' on' : ''}`}
                  onClick={() => setNewPerDay(n)}
                  type="button"
                >
                  <b className="mono">{n}</b>
                  <span>词 / 天</span>
                </button>
              ))}
            </div>
            <div className="tiny" style={{ marginTop: 8 }}>
              按当前选择，每天大约需要 {Math.max(5, Math.round(newPerDay * 1.2))} 分钟
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <div className="onboard-title">有目标考试日期吗？</div>
            <div className="onboard-sub">设置后首页会显示倒计时和每日配速；不设也可以随时来学</div>
            <div className="exam-input">
              <input
                type="date"
                min={dateKey(Date.now())}
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
              />
              {examDate && (
                <button className="btn sm ghost" onClick={() => setExamDate('')} type="button">
                  清除
                </button>
              )}
            </div>

            <div className="rules-card">
              <div className="rules-title">学习规则</div>
              <div className="rules-row">
                <span className="rules-num">1</span>
                <span>
                  新词先看一遍预习卡，再开始作答；连续 <b>{settings.masteryStreak}</b> 次答对才算熟练。
                </span>
              </div>
              <div className="rules-row">
                <span className="rules-num">2</span>
                <span>连击需要分布在不同日期，所以熟练通常要跨天完成。</span>
              </div>
              <div className="rules-row">
                <span className="rules-num">3</span>
                <span>熟练后按 1、2、4、7… 天的间隔复习；答错会缩短间隔并重新巩固。</span>
              </div>
            </div>

            <div className="onboard-summary">
              <span className="tag red">{levels.join(' · ')}</span>
              <span className="tag blue">每天 {newPerDay} 词</span>
              <span className="tag">{examDate ? `考试 ${examDate}` : '暂不设考试日期'}</span>
            </div>
          </div>
        )}
      </div>

        <div className="onboard-actions">
          {step > 0 && (
            <button className="btn ghost" onClick={() => setStep(step - 1)} type="button">
              上一步
            </button>
          )}
          {step < 2 ? (
            <button className="btn primary" style={{ flex: 1 }} onClick={() => setStep(step + 1)} type="button">
              下一步
            </button>
          ) : (
            <button className="btn primary" style={{ flex: 1 }} onClick={finish} type="button">
              开始学习
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
