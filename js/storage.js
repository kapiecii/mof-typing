// localStorage 永続化・バックアップ管理モジュール (仕様 7章準拠)

const STORAGE_KEYS = {
  PLAYER: "mofu_player",
  CHARACTER: "mofu_character",
  INVENTORY: "mofu_inventory",
  LEARNING: "mofu_learning",
  HISTORY: "mofu_history",
  SETTINGS: "mofu_settings",
};

const SCHEMA_VERSION = "1.1";

function getTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getDefaultState() {
  return {
    player: {
      version: SCHEMA_VERSION,
      currentPoints: 50,
      totalPoints: 50,
      totalTypedChars: 0,
      totalCorrectChars: 0,
      totalClearedQuestions: 0,
      todayDate: getTodayStr(),
      todayCount: 0,
    },
    character: {
      version: SCHEMA_VERSION,
      name: "もふまる",
      level: 1,
      exp: 0,
      mood: 95,
      fullness: 85,
      totalFed: 0,
      equippedHat: "none",
      equippedWheel: "wood",
      equippedRoom: ["window", "sprout"],
    },
    inventory: {
      version: SCHEMA_VERSION,
      foods: {
        acorn: 2,
        walnut: 0,
        nutset: 0,
        berry: 0,
      },
      unlockedHats: ["none"],
      unlockedWheels: ["wood"],
      unlockedRoom: ["window", "sprout"],
    },
    learning: {
      version: SCHEMA_VERSION,
      // key: `${kanjiId}_on` or `${kanjiId}_kun`
      items: {},
    },
    history: {
      version: SCHEMA_VERSION,
      sessions: [],
    },
    settings: {
      version: SCHEMA_VERSION,
      bgm: false,
      se: true,
      speech: true,
      romajiGuide: true,
      fontSize: "normal",
      defaultCount: 5,
      imageEmbedMode: "iframe", // "iframe" | "source"
    },
  };
}

function safeLoad(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return structuredClone(fallback);
    const parsed = JSON.parse(raw);
    return { ...structuredClone(fallback), ...parsed, version: SCHEMA_VERSION };
  } catch (e) {
    console.warn(`Failed to load ${key}:`, e);
    return structuredClone(fallback);
  }
}

function safeSave(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.warn(`Failed to save ${key}:`, e);
  }
}

class StorageManager {
  constructor() {
    this.defaults = getDefaultState();
    this.reloadAll();
  }

  reloadAll() {
    this.player = safeLoad(STORAGE_KEYS.PLAYER, this.defaults.player);
    this.character = safeLoad(STORAGE_KEYS.CHARACTER, this.defaults.character);
    this.inventory = safeLoad(STORAGE_KEYS.INVENTORY, this.defaults.inventory);
    this.learning = safeLoad(STORAGE_KEYS.LEARNING, this.defaults.learning);
    this.history = safeLoad(STORAGE_KEYS.HISTORY, this.defaults.history);
    this.settings = safeLoad(STORAGE_KEYS.SETTINGS, this.defaults.settings);

    const today = getTodayStr();
    if (this.player.todayDate !== today) {
      this.player.todayDate = today;
      this.player.todayCount = 0;
      this.savePlayer();
    }
  }

  savePlayer() {
    safeSave(STORAGE_KEYS.PLAYER, this.player);
  }

  saveCharacter() {
    safeSave(STORAGE_KEYS.CHARACTER, this.character);
  }

  saveInventory() {
    safeSave(STORAGE_KEYS.INVENTORY, this.inventory);
  }

  saveLearning() {
    safeSave(STORAGE_KEYS.LEARNING, this.learning);
  }

  saveHistory() {
    safeSave(STORAGE_KEYS.HISTORY, this.history);
  }

  saveSettings() {
    safeSave(STORAGE_KEYS.SETTINGS, this.settings);
  }

  saveAll() {
    this.savePlayer();
    this.saveCharacter();
    this.saveInventory();
    this.saveLearning();
    this.saveHistory();
    this.saveSettings();
  }

  getReadingRecord(kanjiId, readingType) {
    const key = `${kanjiId}_${readingType}`;
    if (!this.learning.items[key]) {
      this.learning.items[key] = {
        kanjiId,
        readingType,
        attempts: 0,
        cleared: 0,
        perfects: 0,
        misses: 0,
        correctKeys: 0,
        mastery: 0, // 0: 未学習, 1: 学習中, 2: 習得済み
        lastPlayed: null,
      };
    }
    return this.learning.items[key];
  }

  recordQuestionResult({ kanjiId, readingType, correctKeys, misses, pointsEarned, expEarned }) {
    const rec = this.getReadingRecord(kanjiId, readingType);
    const wasMastered = rec.mastery >= 2;
    const wasUnlearned = rec.attempts === 0;

    rec.attempts += 1;
    rec.cleared += 1;
    rec.correctKeys += correctKeys;
    rec.misses += misses;
    if (misses === 0) {
      rec.perfects += 1;
    }
    rec.lastPlayed = new Date().toISOString();

    // 習熟度判定: ノーミス1回以上 または クリア2回以上で習得済み(2)、それ以外は学習中(1)
    if (rec.perfects >= 1 || rec.cleared >= 2) {
      rec.mastery = 2;
    } else {
      rec.mastery = 1;
    }
    this.saveLearning();

    // プレイヤー統計・ポイント即時保存
    const today = getTodayStr();
    if (this.player.todayDate !== today) {
      this.player.todayDate = today;
      this.player.todayCount = 0;
    }
    this.player.todayCount += 1;
    this.player.totalClearedQuestions += 1;
    this.player.totalTypedChars += correctKeys + misses;
    this.player.totalCorrectChars += correctKeys;
    this.player.currentPoints += pointsEarned;
    this.player.totalPoints += pointsEarned;
    this.savePlayer();

    return {
      newlyLearned: wasUnlearned,
      newlyMastered: !wasMastered && rec.mastery >= 2,
      record: rec,
    };
  }

  recordSessionSummary(summary) {
    this.history.sessions.unshift({
      ...summary,
      timestamp: new Date().toISOString(),
    });
    if (this.history.sessions.length > 100) {
      this.history.sessions.length = 100;
    }
    this.saveHistory();
  }

  exportBackupJSON() {
    const payload = {
      app: "mofu-typing",
      version: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      data: {
        [STORAGE_KEYS.PLAYER]: this.player,
        [STORAGE_KEYS.CHARACTER]: this.character,
        [STORAGE_KEYS.INVENTORY]: this.inventory,
        [STORAGE_KEYS.LEARNING]: this.learning,
        [STORAGE_KEYS.HISTORY]: this.history,
        [STORAGE_KEYS.SETTINGS]: this.settings,
      },
    };
    return JSON.stringify(payload, null, 2);
  }

  importBackupJSON(jsonStr) {
    const parsed = JSON.parse(jsonStr);
    if (!parsed || parsed.app !== "mofu-typing" || !parsed.data) {
      throw new Error("もふタイ！のバックアップファイルではありません。");
    }
    const d = parsed.data;
    if (d[STORAGE_KEYS.PLAYER]) safeSave(STORAGE_KEYS.PLAYER, d[STORAGE_KEYS.PLAYER]);
    if (d[STORAGE_KEYS.CHARACTER]) safeSave(STORAGE_KEYS.CHARACTER, d[STORAGE_KEYS.CHARACTER]);
    if (d[STORAGE_KEYS.INVENTORY]) safeSave(STORAGE_KEYS.INVENTORY, d[STORAGE_KEYS.INVENTORY]);
    if (d[STORAGE_KEYS.LEARNING]) safeSave(STORAGE_KEYS.LEARNING, d[STORAGE_KEYS.LEARNING]);
    if (d[STORAGE_KEYS.HISTORY]) safeSave(STORAGE_KEYS.HISTORY, d[STORAGE_KEYS.HISTORY]);
    if (d[STORAGE_KEYS.SETTINGS]) safeSave(STORAGE_KEYS.SETTINGS, d[STORAGE_KEYS.SETTINGS]);
    this.reloadAll();
  }

  resetAll() {
    Object.values(STORAGE_KEYS).forEach((k) => localStorage.removeItem(k));
    this.reloadAll();
    this.saveAll();
  }
}
