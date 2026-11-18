// スコア・経験値・レベル計算・効果音・音声読み上げモジュール (仕様 4.3 / 4.4 / 4.7 準拠)

function getRequiredExpForLevel(level) {
  return 80 + (level - 1) * 40;
}

function calculateQuestionReward({ charCount, misses, maxCombo, difficulty, isReviewTarget }) {
  // 基本ポイント: 文字数ボーナス + ベース
  const basePt = difficulty === "challenge" ? 20 : 12;
  const lengthPt = Math.max(4, Math.round(charCount * 0.6));
  // ノーミスボーナス / 高正確率ボーナス (ミスで減点はしない)
  const accuracyBonus = misses === 0 ? 10 : misses <= 2 ? 5 : 2;
  const comboBonus = Math.min(15, Math.floor(maxCombo / 5) * 2);
  const reviewBonus = isReviewTarget ? 5 : 0;

  const points = basePt + lengthPt + accuracyBonus + comboBonus + reviewBonus;
  const exp = 18 + (misses === 0 ? 12 : 5) + (difficulty === "challenge" ? 8 : 0);

  return {
    points,
    exp,
    isPerfect: misses === 0,
  };
}

function applyExpToCharacter(character, expGained) {
  let leveledUp = false;
  const prevLevel = character.level;
  character.exp += expGained;

  while (character.exp >= getRequiredExpForLevel(character.level)) {
    character.exp -= getRequiredExpForLevel(character.level);
    character.level += 1;
    leveledUp = true;
  }

  character.mood = Math.min(100, (character.mood || 85) + 4);
  return {
    leveledUp,
    prevLevel,
    newLevel: character.level,
    currentExp: character.exp,
    nextExp: getRequiredExpForLevel(character.level),
  };
}

// Web Audio API による優しい森の効果音・オルゴールBGM
class SoundManager {
  constructor(settingsGetter) {
    this.getSettings = settingsGetter;
    this.ctx = null;
    this.bgmTimer = null;
    this.bgmNoteIdx = 0;
  }

  ensureCtx() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  playTone(freq, duration = 0.08, type = "sine", gainVal = 0.12, delay = 0) {
    const settings = this.getSettings();
    if (!settings || !settings.se) return;
    const ctx = this.ensureCtx();
    if (!ctx) return;

    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(gainVal, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  playTypeOk(combo = 1) {
    const pitchBoost = Math.min(200, combo * 6);
    this.playTone(520 + pitchBoost, 0.065, "triangle", 0.11);
  }

  playTypeMiss() {
    // 威圧的でない、やさしい木琴風の「ポコ」音
    this.playTone(250, 0.11, "sine", 0.10);
  }

  playQuestionClear(isPerfect = false) {
    const notes = isPerfect ? [523.25, 659.25, 783.99, 1046.5] : [523.25, 659.25, 783.99];
    notes.forEach((n, i) => {
      this.playTone(n, 0.16, "triangle", 0.13, i * 0.07);
    });
  }

  playLevelUp() {
    const notes = [523.25, 587.33, 659.25, 783.99, 1046.5];
    notes.forEach((n, i) => {
      this.playTone(n, 0.22, "triangle", 0.15, i * 0.08);
    });
  }

  playFeed() {
    this.playTone(587.33, 0.1, "sine", 0.12, 0);
    this.playTone(783.99, 0.14, "sine", 0.12, 0.11);
    this.playTone(880.0, 0.18, "triangle", 0.12, 0.22);
  }

  updateBgmState() {
    const settings = this.getSettings();
    if (settings && settings.bgm) {
      this.startBgm();
    } else {
      this.stopBgm();
    }
  }

  startBgm() {
    if (this.bgmTimer) return;
    const melody = [523.25, 659.25, 783.99, 659.25, 587.33, 698.46, 659.25, 523.25];
    this.bgmTimer = setInterval(() => {
      const settings = this.getSettings();
      if (!settings || !settings.bgm) {
        this.stopBgm();
        return;
      }
      const ctx = this.ensureCtx();
      if (!ctx) return;
      const freq = melody[this.bgmNoteIdx % melody.length];
      this.bgmNoteIdx += 1;

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.035, now + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.48);
    }, 520);
  }

  stopBgm() {
    if (this.bgmTimer) {
      clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
  }
}

function speakText(text, enabled = true) {
  if (!enabled || !("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "ja-JP";
    utter.rate = 0.95;
    utter.pitch = 1.08;
    window.speechSynthesis.speak(utter);
  } catch (e) {
    // ignore speech error
  }
}
