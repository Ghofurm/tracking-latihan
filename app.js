/*
 * Calisthenics Tracker — logika aplikasi.
 *
 * Tanpa framework, tanpa build step. Data disimpan di localStorage.
 */
(function () {
  'use strict';

  const PROGRAM = window.CALISTHENICS_DATA;

  if (!PROGRAM) {
    document.addEventListener('DOMContentLoaded', function () {
      const main = document.getElementById('app-main');
      if (main) {
        main.innerHTML = '<div class="view"><section class="card error-card"><h1>Data program tidak ditemukan</h1><p>Pastikan file <code>data.js</code> dimuat sebelum <code>app.js</code>.</p></section></div>';
      }
    });
    return;
  }

  const DATA_VERSION = PROGRAM.dataVersion;
  const STORAGE_KEY = PROGRAM.storageKey;
  const REST_RULES = PROGRAM.rules.restTimer;
  const JOGGING_RULES = PROGRAM.rules.jogging;

  const formatDateLong = new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const formatDateMedium = new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const formatDateDayMonthYear = new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const formatDateCompact = new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'numeric',
  });
  const formatTime = new Intl.DateTimeFormat('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const formatWeekday = new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const state = {
    data: null,
    storageError: null,
    rawStorage: null,
    view: 'today',
    historyDetailId: null,
    selectedExercise: PROGRAM.exerciseOrder[0],
    activeSession: null,
    skipEditorIndex: null,
    toastTimeout: null,
    timer: {
      total: REST_RULES.defaultSeconds,
      remaining: REST_RULES.defaultSeconds,
      endAt: null,
      intervalId: null,
      running: false,
      finished: false,
    },
  };

  // ---------------------------------------------------------------------------
  // Utilitas umum
  // ---------------------------------------------------------------------------

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function toNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value).replace(/[&<>"']/g, function (character) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      }[character];
    });
  }

  function capitalize(value) {
    const text = String(value || '');
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  function localDateKey(date) {
    const value = date || new Date();
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return year + '-' + month + '-' + day;
  }

  function dateFromKey(key) {
    if (typeof key !== 'string') return null;
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function parseTimestamp(value) {
    if (!value) return 0;
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : 0;
  }

  function sessionTimestamp(session) {
    const fromStart = parseTimestamp(session.startedAt);
    if (fromStart) return fromStart;
    const date = dateFromKey(session.date);
    return date ? date.getTime() : 0;
  }

  function logTimestamp(log) {
    const fromCreated = parseTimestamp(log.createdAt);
    if (fromCreated) return fromCreated;
    const date = dateFromKey(log.date);
    return date ? date.getTime() : 0;
  }

  function joggingDateTimestamp(log) {
    const date = dateFromKey(log.date);
    if (date) return date.getTime();
    return parseTimestamp(log.createdAt);
  }

  function formatClock(totalSeconds) {
    const safe = Math.max(0, Math.round(totalSeconds));
    const minutes = String(Math.floor(safe / 60)).padStart(2, '0');
    const seconds = String(safe % 60).padStart(2, '0');
    return minutes + ':' + seconds;
  }

  function formatSessionDateShort(dateKey) {
    const date = dateFromKey(dateKey);
    return date ? formatDateMedium.format(date) : dateKey;
  }

  function formatJoggingDate(dateKey) {
    const date = dateFromKey(dateKey);
    return date ? formatDateLong.format(date) : dateKey;
  }

  function formatTimeValue(value) {
    const timestamp = parseTimestamp(value);
    if (!timestamp) return '';
    return formatTime.format(new Date(timestamp));
  }

  function formatMinutesBetween(start, finish) {
    const startTime = parseTimestamp(start);
    const finishTime = parseTimestamp(finish);
    if (!startTime || !finishTime || finishTime < startTime) return '';
    const minutes = Math.max(1, Math.round((finishTime - startTime) / 60000));
    return minutes + ' menit';
  }

  function dayKeyForDate(date) {
    return PROGRAM.dayKeys[(date || new Date()).getDay()];
  }

  function dayLabel(dayKey) {
    return PROGRAM.dayLabels[dayKey] || capitalize(dayKey);
  }

  function scheduleForDay(dayKey) {
    return PROGRAM.schedule[dayKey] || null;
  }

  function todayInfo() {
    const now = new Date();
    const day = dayKeyForDate(now);
    return {
      now: now,
      dateKey: localDateKey(now),
      day: day,
      schedule: scheduleForDay(day),
    };
  }

  function nextWorkoutInfo(fromDate) {
    const start = fromDate || new Date();
    for (let offset = 1; offset <= 7; offset += 1) {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + offset);
      const key = dayKeyForDate(date);
      const schedule = scheduleForDay(key);
      if (schedule && schedule.type !== 'rest') {
        return { key: key, schedule: schedule, date: date };
      }
    }
    return null;
  }

  function getExerciseDef(key) {
    return PROGRAM.exercises[key] || null;
  }

  function exerciseName(key) {
    const def = getExerciseDef(key);
    return def ? def.name : capitalize(String(key || '').replace(/-/g, ' '));
  }

  function targetText(value, def) {
    if (!def) return String(value);
    if (def.unitLabel) return value + ' ' + def.unitLabel;
    return value + ' ' + (def.type === 'duration' ? 'detik' : 'reps');
  }

  function targetShortText(key) {
    const def = getExerciseDef(key);
    if (!def) return '';
    const level = getLevel(key);
    if (def.progression.kind === 'pullup') {
      return level.target + ' rep · turun ' + level.tempo + ' dtk';
    }
    if (def.progression.kind === 'incline') {
      return level.target + ' rep · variasi ' + level.stage;
    }
    return level.target + ' ' + (def.unitLabel || def.unitShort);
  }

  function sessionStats(session) {
    let exerciseCount = 0;
    let skipped = 0;
    let totalSets = 0;
    let doneSets = 0;

    (session.exercises || []).forEach(function (exercise) {
      exerciseCount += 1;
      if (exercise.skipped) {
        skipped += 1;
        return;
      }
      const sets = Array.isArray(exercise.sets) ? exercise.sets : [];
      totalSets += sets.length;
      doneSets += sets.filter(function (set) { return set.done; }).length;
    });

    return {
      exerciseCount: exerciseCount,
      skipped: skipped,
      totalSets: totalSets,
      doneSets: doneSets,
    };
  }

  function sortedSessionsNewest() {
    return state.data.sessions.slice().sort(function (a, b) {
      return sessionTimestamp(b) - sessionTimestamp(a);
    });
  }

  function sortedJoggingNewest() {
    return state.data.joggingLog.slice().sort(function (a, b) {
      return (joggingDateTimestamp(b) - joggingDateTimestamp(a))
        || (logTimestamp(b) - logTimestamp(a));
    });
  }

  function getSessionById(id) {
    return state.data.sessions.find(function (session) { return session.id === id; }) || null;
  }

  // ---------------------------------------------------------------------------
  // Penyimpanan dan model data
  // ---------------------------------------------------------------------------

  function createEmptyData() {
    return {
      version: DATA_VERSION,
      sessions: [],
      joggingLog: [],
      settings: {
        restSeconds: REST_RULES.defaultSeconds,
        fullPullUpAt: null,
      },
      levels: {},
    };
  }

  function normalizeSet(rawSet) {
    if (!rawSet || typeof rawSet !== 'object') return null;
    const target = toNumber(rawSet.target);
    if (target === null || target < 0) return null;
    const actual = toNumber(rawSet.actual);
    const normalized = {
      target: target,
      actual: actual === null ? null : Math.max(0, actual),
      unit: typeof rawSet.unit === 'string' ? rawSet.unit : 'reps',
      done: Boolean(rawSet.done),
    };
    const descent = toNumber(rawSet.descent);
    const descentTarget = toNumber(rawSet.descentTarget);
    if (descent !== null) normalized.descent = Math.max(0, descent);
    if (descentTarget !== null) normalized.descentTarget = Math.max(0, descentTarget);
    return normalized;
  }

  function normalizeExercise(rawExercise) {
    if (!rawExercise || typeof rawExercise !== 'object' || typeof rawExercise.key !== 'string') return null;
    return {
      key: rawExercise.key,
      sets: Array.isArray(rawExercise.sets) ? rawExercise.sets.map(normalizeSet).filter(Boolean) : [],
      skipped: Boolean(rawExercise.skipped),
      note: typeof rawExercise.note === 'string' ? rawExercise.note : '',
    };
  }

  function normalizeSession(rawSession) {
    if (!rawSession || typeof rawSession !== 'object') return null;
    if (typeof rawSession.id !== 'string' || !rawSession.id) return null;
    if (typeof rawSession.date !== 'string' || !dateFromKey(rawSession.date)) return null;
    return {
      id: rawSession.id,
      date: rawSession.date,
      day: typeof rawSession.day === 'string' ? rawSession.day : dayKeyForDate(dateFromKey(rawSession.date)),
      startedAt: typeof rawSession.startedAt === 'string' ? rawSession.startedAt : '',
      finishedAt: typeof rawSession.finishedAt === 'string' ? rawSession.finishedAt : '',
      exercises: Array.isArray(rawSession.exercises) ? rawSession.exercises.map(normalizeExercise).filter(Boolean) : [],
    };
  }

  function normalizeJogging(rawLog) {
    if (!rawLog || typeof rawLog !== 'object') return null;
    if (typeof rawLog.id !== 'string' || !rawLog.id) return null;
    if (typeof rawLog.date !== 'string' || !dateFromKey(rawLog.date)) return null;
    const durationMin = toNumber(rawLog.durationMin);
    const intervals = toNumber(rawLog.intervals);
    if (durationMin === null || durationMin <= 0) return null;
    if (intervals === null || intervals < 1) return null;
    const normalized = {
      id: rawLog.id,
      date: rawLog.date,
      durationMin: Math.round(durationMin),
      intervals: Math.round(intervals),
      note: typeof rawLog.note === 'string' ? rawLog.note : '',
    };
    if (typeof rawLog.createdAt === 'string' && parseTimestamp(rawLog.createdAt)) {
      normalized.createdAt = rawLog.createdAt;
    }
    return normalized;
  }

  function normalizeLevels(rawLevels) {
    const levels = {};
    if (!rawLevels || typeof rawLevels !== 'object' || Array.isArray(rawLevels)) return levels;

    Object.keys(rawLevels).forEach(function (key) {
      if (key !== 'jogging' && !getExerciseDef(key)) return;
      const raw = rawLevels[key];
      if (!raw || typeof raw !== 'object') return;
      const entry = {};
      const target = toNumber(raw.target);
      const tempo = toNumber(raw.tempo);
      const stage = toNumber(raw.stage);
      if (target !== null) {
        const max = key === 'jogging' ? JOGGING_RULES.maxRunMinutes : Infinity;
        entry.target = clamp(Math.round(target), PROGRAM.rules.minTargetValue, max);
      }
      if (tempo !== null) entry.tempo = Math.max(0, Math.round(tempo));
      if (stage !== null) entry.stage = Math.max(1, Math.round(stage));
      if (typeof raw.updatedAt === 'string' && parseTimestamp(raw.updatedAt)) {
        entry.updatedAt = raw.updatedAt;
      }
      levels[key] = entry;
    });

    return levels;
  }

  function normalizeData(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    if (raw.version !== DATA_VERSION) return null;
    if (!Array.isArray(raw.sessions) || !Array.isArray(raw.joggingLog)) return null;

    const rawSettings = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
    const rawRest = toNumber(rawSettings.restSeconds);
    const restSeconds = clamp(
      rawRest === null ? REST_RULES.defaultSeconds : Math.round(rawRest),
      REST_RULES.minSeconds,
      REST_RULES.maxSeconds
    );

    return {
      version: DATA_VERSION,
      sessions: raw.sessions.map(normalizeSession).filter(Boolean),
      joggingLog: raw.joggingLog.map(normalizeJogging).filter(Boolean),
      settings: {
        restSeconds: restSeconds,
        fullPullUpAt: typeof rawSettings.fullPullUpAt === 'string' && parseTimestamp(rawSettings.fullPullUpAt)
          ? rawSettings.fullPullUpAt
          : null,
      },
      levels: normalizeLevels(raw.levels),
    };
  }

  function loadData() {
    let raw = null;
    try {
      raw = window.localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      state.storageError = 'Browser tidak mengizinkan akses penyimpanan lokal. Data tidak dapat dimuat.';
      state.data = createEmptyData();
      return;
    }

    if (raw === null) {
      state.data = createEmptyData();
      return;
    }

    state.rawStorage = raw;

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      state.storageError = 'Data tersimpan tidak bisa dibaca karena formatnya rusak.';
      state.data = createEmptyData();
      return;
    }

    if (!parsed || parsed.version !== DATA_VERSION) {
      const found = parsed && parsed.version !== undefined ? parsed.version : 'tidak dikenal';
      state.storageError = 'Versi data tersimpan (' + found + ') tidak cocok dengan versi aplikasi (' + DATA_VERSION + ').';
      state.data = createEmptyData();
      return;
    }

    const normalized = normalizeData(parsed);
    if (!normalized) {
      state.storageError = 'Struktur data tersimpan tidak dikenali. Data lama tidak akan ditimpa otomatis.';
      state.data = createEmptyData();
      return;
    }

    state.data = normalized;
  }

  function saveData() {
    if (state.storageError) return false;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
      return true;
    } catch (error) {
      showToast('Gagal menyimpan data. Penyimpanan browser mungkin penuh.', 'error');
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Level aktif dan saran naik level
  // ---------------------------------------------------------------------------

  function getLevel(key) {
    const def = getExerciseDef(key);
    if (!def) return { target: 0 };

    const stored = state.data.levels[key] || {};
    const base = { target: def.target };
    if (def.progression.kind === 'pullup') base.tempo = def.tempo.initial;
    if (def.progression.kind === 'incline') base.stage = 1;

    return {
      target: toNumber(stored.target) !== null ? Math.max(PROGRAM.rules.minTargetValue, stored.target) : base.target,
      tempo: toNumber(stored.tempo) !== null
        ? stored.tempo
        : (base.tempo !== undefined ? base.tempo : undefined),
      stage: toNumber(stored.stage) !== null
        ? Math.max(1, stored.stage)
        : (base.stage !== undefined ? base.stage : undefined),
      updatedAt: typeof stored.updatedAt === 'string' ? stored.updatedAt : null,
    };
  }

  function getJoggingLevel() {
    const stored = state.data.levels.jogging || {};
    const target = toNumber(stored.target) !== null
      ? clamp(Math.round(stored.target), 1, JOGGING_RULES.maxRunMinutes)
      : JOGGING_RULES.initialRunMinutes;
    return {
      target: target,
      level: Math.max(1, target - JOGGING_RULES.initialRunMinutes + 1),
      updatedAt: typeof stored.updatedAt === 'string' ? stored.updatedAt : null,
    };
  }

  function setsMeetStrictLevelGoal(sets, def) {
    if (!sets.length || sets.length < def.sets) return false;
    return sets.every(function (set) {
      if (!set.done || toNumber(set.actual) === null) return false;
      let required = toNumber(set.target) || 0;
      if (def.progression.kind === 'pullup') {
        required = Math.max(required, def.progression.repsGoal);
      }
      if (toNumber(set.actual) < required) return false;

      if (def.progression.kind === 'pullup') {
        const requiredTempo = Math.max(
          toNumber(set.descentTarget) !== null ? toNumber(set.descentTarget) : def.tempo.initial,
          def.progression.tempoMinSeconds
        );
        if (toNumber(set.descent) === null || toNumber(set.descent) < requiredTempo) return false;
      }
      return true;
    });
  }

  function setsMeetBaseTarget(sets, def) {
    if (!sets.length || sets.length < def.sets) return false;
    return sets.every(function (set) {
      if (!set.done || toNumber(set.actual) === null) return false;
      if (toNumber(set.actual) < (toNumber(set.target) || 0)) return false;

      if (def.progression.kind === 'pullup') {
        const requiredTempo = toNumber(set.descentTarget) !== null
          ? toNumber(set.descentTarget)
          : def.tempo.initial;
        if (toNumber(set.descent) === null || toNumber(set.descent) < requiredTempo) return false;
      }
      return true;
    });
  }

  function getExerciseHistory(key) {
    const level = getLevel(key);
    // Sesi sebelum level terakhir diterima tidak dihitung, supaya saran yang
    // sama tidak muncul berulang tanpa sesi baru di level tersebut.
    const cutoff = parseTimestamp(level.updatedAt);
    const entries = [];

    state.data.sessions.forEach(function (session) {
      const exercise = (session.exercises || []).find(function (item) { return item.key === key; });
      if (!exercise || exercise.skipped) return;
      if (cutoff && sessionTimestamp(session) <= cutoff) return;
      entries.push({ session: session, exercise: exercise });
    });

    entries.sort(function (a, b) {
      return sessionTimestamp(b.session) - sessionTimestamp(a.session);
    });

    return entries;
  }

  function buildIncreaseSuggestion(key, def, level) {
    if (def.progression.kind === 'linear') {
      const nextTarget = level.target + def.progression.increment;
      const unitIncrement = def.type === 'duration' ? 'detik' : 'rep';
      return {
        key: key,
        name: def.name,
        type: 'increase',
        text: 'Tambah ' + def.progression.increment + ' ' + unitIncrement + ' menjadi ' + targetText(nextTarget, def) + '.',
        actionLabel: 'Terima',
        next: { target: nextTarget },
        toast: 'Target ' + def.name + ' menjadi ' + targetText(nextTarget, def) + '.',
      };
    }

    if (def.progression.kind === 'incline') {
      const nextStage = (level.stage || 1) + 1;
      const resetTarget = def.progression.resetTarget || def.target;
      return {
        key: key,
        name: def.name,
        type: 'increase',
        text: 'Turunkan tumpuan ke variasi ' + nextStage + ' dan reset target ke ' + targetText(resetTarget, def) + '.',
        actionLabel: 'Turunkan tumpuan',
        next: { target: resetTarget, stage: nextStage },
        toast: 'Variasi ' + def.name + ' naik. Gunakan tumpuan yang lebih rendah pada sesi berikutnya.',
      };
    }

    if (def.progression.kind === 'pullup') {
      const nextReps = Math.max(level.target, def.progression.setRepsTargetTo);
      const nextTempo = (toNumber(level.tempo) !== null ? level.tempo : def.tempo.initial) + def.progression.tempoIncrementSeconds;
      return {
        key: key,
        name: def.name,
        type: 'increase',
        text: 'Tambah durasi turun ' + def.progression.tempoIncrementSeconds + ' detik (jadi ' + nextTempo + ' detik), atau coba ' + def.progression.fullPullUpGoal + ' pull-up penuh.',
        actionLabel: 'Tambah ' + def.progression.tempoIncrementSeconds + ' dtk',
        next: { target: nextReps, tempo: nextTempo },
        toast: 'Target ' + def.name + ' menjadi ' + nextReps + ' rep dengan turun ' + nextTempo + ' detik.',
      };
    }

    return null;
  }

  function buildFailureSuggestion(key, def, level) {
    const percent = PROGRAM.rules.failureReductionPercent;
    const requiredSessions = PROGRAM.rules.minSessionsForSuggestion;
    const restWeeks = PROGRAM.rules.failureRestWeeks;
    let nextTarget = Math.round(level.target * (1 - percent / 100));
    if (nextTarget >= level.target) nextTarget = level.target - 1;
    nextTarget = Math.max(PROGRAM.rules.minTargetValue, nextTarget);

    return {
      key: key,
      name: def.name,
      type: 'failure',
      text: requiredSessions + ' sesi terakhir belum mencapai target: pertahankan level dan istirahat ' + restWeeks + ' minggu, atau turunkan target ' + percent + '% menjadi ' + targetText(nextTarget, def) + '.',
      actionLabel: 'Turunkan ' + percent + '%',
      next: { target: nextTarget },
      toast: 'Target ' + def.name + ' diturunkan menjadi ' + targetText(nextTarget, def) + '.',
    };
  }

  function getSuggestionForExercise(key) {
    const def = getExerciseDef(key);
    if (!def) return null;

    const level = getLevel(key);
    const history = getExerciseHistory(key);
    const required = PROGRAM.rules.minSessionsForSuggestion;
    if (history.length < required) return null;

    const recent = history.slice(0, required);
    const results = recent.map(function (entry) {
      const sets = entry.exercise.sets || [];
      return {
        success: setsMeetStrictLevelGoal(sets, def),
        failure: !setsMeetBaseTarget(sets, def),
      };
    });

    if (results.every(function (result) { return result.success; })) {
      return buildIncreaseSuggestion(key, def, level);
    }
    if (results.every(function (result) { return result.failure; })) {
      return buildFailureSuggestion(key, def, level);
    }
    return null;
  }

  function getSuggestionForJogging() {
    const level = getJoggingLevel();
    const cutoffDate = level.updatedAt ? localDateKey(new Date(level.updatedAt)) : null;
    const logs = state.data.joggingLog
      .filter(function (log) {
        if (!cutoffDate) return true;
        return log.date > cutoffDate;
      })
      .sort(function (a, b) {
        return (joggingDateTimestamp(b) - joggingDateTimestamp(a))
          || (logTimestamp(b) - logTimestamp(a));
      });

    // Satu tanggal hanya dihitung sebagai satu sesi jogging.
    const required = PROGRAM.rules.minSessionsForSuggestion;
    const recent = [];
    const seenDates = {};
    for (let i = 0; i < logs.length && recent.length < required; i += 1) {
      if (seenDates[logs[i].date]) continue;
      seenDates[logs[i].date] = true;
      recent.push(logs[i]);
    }

    if (recent.length < required) return null;

    const success = recent.every(function (log) {
      return Number(log.durationMin) >= JOGGING_RULES.totalMinutes;
    });
    const failure = recent.every(function (log) {
      return Number(log.durationMin) < JOGGING_RULES.totalMinutes;
    });

    if (success && level.target < JOGGING_RULES.maxRunMinutes) {
      const nextTarget = Math.min(
        JOGGING_RULES.maxRunMinutes,
        level.target + JOGGING_RULES.runIncrementMinutes
      );
      return {
        key: 'jogging',
        name: 'Jogging',
        type: 'increase',
        text: 'Tambah ' + JOGGING_RULES.runIncrementMinutes + ' menit lari menjadi ' + nextTarget + ' menit dari total ' + JOGGING_RULES.totalMinutes + ' menit.',
        actionLabel: 'Terima',
        next: { target: nextTarget },
        toast: 'Porsi lari jogging menjadi ' + nextTarget + ' menit dari total ' + JOGGING_RULES.totalMinutes + ' menit.',
      };
    }

    if (failure) {
      const percent = JOGGING_RULES.failureReductionPercent;
      const reduction = Math.max(1, Math.round(level.target * percent / 100));
      const nextTarget = Math.max(1, level.target - reduction);
      return {
        key: 'jogging',
        name: 'Jogging',
        type: 'failure',
        text: PROGRAM.rules.minSessionsForSuggestion + ' sesi terakhir belum mencapai ' + JOGGING_RULES.totalMinutes + ' menit: pertahankan level dan istirahat ' + PROGRAM.rules.failureRestWeeks + ' minggu, atau turunkan porsi lari ' + percent + '% menjadi ' + nextTarget + ' menit.',
        actionLabel: 'Turunkan ' + percent + '%',
        next: { target: nextTarget },
        toast: 'Porsi lari jogging diturunkan menjadi ' + nextTarget + ' menit.',
      };
    }

    return null;
  }

  function isExerciseScheduledToday(key) {
    const info = todayInfo();
    if (!info.schedule) return false;
    if (key === 'jogging') return info.schedule.type === 'jogging';
    if (info.schedule.type !== 'strength') return false;
    return info.schedule.items.some(function (item) {
      return item.key === key || (item.alternatives || []).includes(key);
    });
  }

  function getAllSuggestions() {
    const suggestions = [];
    PROGRAM.exerciseOrder.forEach(function (key) {
      const suggestion = getSuggestionForExercise(key);
      if (suggestion) {
        suggestion.isToday = isExerciseScheduledToday(key);
        suggestions.push(suggestion);
      }
    });

    const joggingSuggestion = getSuggestionForJogging();
    if (joggingSuggestion) {
      joggingSuggestion.isToday = isExerciseScheduledToday('jogging');
      suggestions.push(joggingSuggestion);
    }

    return suggestions.sort(function (a, b) {
      return Number(b.isToday) - Number(a.isToday);
    });
  }

  function updateLevel(key, patch, successMessage) {
    const previous = state.data.levels[key] ? Object.assign({}, state.data.levels[key]) : null;
    const next = Object.assign({}, state.data.levels[key] || {}, patch, {
      updatedAt: new Date().toISOString(),
    });
    state.data.levels[key] = next;

    if (!saveData()) {
      if (previous) state.data.levels[key] = previous;
      else delete state.data.levels[key];
      return false;
    }

    if (successMessage) showToast(successMessage);
    return true;
  }

  function acceptSuggestion(key) {
    const suggestion = key === 'jogging'
      ? getSuggestionForJogging()
      : getSuggestionForExercise(key);

    if (!suggestion) {
      showToast('Saran ini sudah tidak berlaku. Muat ulang data dengan menyelesaikan sesi baru.', 'error');
      return;
    }

    if (updateLevel(key, suggestion.next, suggestion.toast)) {
      render();
    }
  }

  // ---------------------------------------------------------------------------
  // Sesi latihan
  // ---------------------------------------------------------------------------

  function buildExerciseEntry(key) {
    const def = getExerciseDef(key);
    const level = getLevel(key);
    if (!def) {
      return { key: key, sets: [], skipped: false, note: '' };
    }

    const sets = [];
    for (let index = 0; index < def.sets; index += 1) {
      const set = {
        target: level.target,
        actual: null,
        unit: def.unit,
        done: false,
      };
      if (def.progression.kind === 'pullup') {
        set.descent = null;
        set.descentTarget = level.tempo;
      }
      sets.push(set);
    }

    return {
      key: key,
      sets: sets,
      skipped: false,
      note: '',
    };
  }

  function createActiveSession() {
    const info = todayInfo();
    if (!info.schedule || info.schedule.type !== 'strength') {
      showToast('Tidak ada sesi kekuatan yang bisa dimulai hari ini.', 'error');
      return;
    }

    const alreadySaved = state.data.sessions.some(function (session) {
      return session.date === info.dateKey;
    });
    if (alreadySaved) {
      showToast('Sesi hari ini sudah tercatat. Hapus sesi itu dulu jika ingin mengulang.', 'error');
      return;
    }

    const items = info.schedule.items.map(function (item) {
      const options = [item.key].concat(item.alternatives || []);
      return {
        key: item.key,
        options: options,
        exercise: buildExerciseEntry(item.key),
      };
    });

    state.activeSession = {
      date: info.dateKey,
      day: info.day,
      startedAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
      items: items,
    };
    state.skipEditorIndex = null;
    setRestTimer(getRestSeconds());
    render();
    window.scrollTo(0, 0);
  }

  function discardActiveSession() {
    stopRestTimer();
    state.activeSession = null;
    state.skipEditorIndex = null;
    state.view = 'today';
    render();
    window.scrollTo(0, 0);
  }

  function hasSessionProgress(session) {
    if (!session) return false;
    return session.items.some(function (item) {
      return item.exercise.skipped
        || Boolean(item.exercise.note)
        || item.exercise.sets.some(function (set) {
          return set.done || set.actual !== null || set.descent !== undefined && set.descent !== null;
        });
    });
  }

  function makeSessionId(startedAt, dayKey) {
    const base = String(startedAt).replace(/\.\d{3}Z$/, 'Z') + '-' + dayKey;
    let id = base;
    let counter = 2;
    while (state.data.sessions.some(function (session) { return session.id === id; })) {
      id = base + '-' + counter;
      counter += 1;
    }
    return id;
  }

  function saveActiveSession() {
    const active = state.activeSession;
    if (!active) return;

    if (!hasSessionProgress(active)) {
      if (!window.confirm('Belum ada set yang ditandai selesai. Simpan sesi kosong ini?')) return;
    }

    const exercises = active.items.map(function (item) {
      return {
        key: item.exercise.key,
        sets: item.exercise.sets.map(function (set) {
          const stored = {
            target: set.target,
            actual: set.actual,
            unit: set.unit,
            done: Boolean(set.done),
          };
          if (set.descentTarget !== undefined) {
            stored.descent = set.descent;
            stored.descentTarget = set.descentTarget;
          }
          return stored;
        }),
        skipped: Boolean(item.exercise.skipped),
        note: item.exercise.note || '',
      };
    });

    const finishedAt = new Date().toISOString();
    const session = {
      id: makeSessionId(active.startedAt, active.day),
      date: active.date,
      day: active.day,
      startedAt: active.startedAt,
      finishedAt: finishedAt,
      exercises: exercises,
    };

    state.data.sessions.push(session);
    if (!saveData()) {
      state.data.sessions.pop();
      return;
    }

    stopRestTimer();
    state.activeSession = null;
    state.skipEditorIndex = null;
    state.view = 'today';
    state.historyDetailId = null;
    render();
    window.scrollTo(0, 0);
    showToast('Sesi tersimpan. Progres dan saran sudah diperbarui.');
  }

  function changeVariant(itemIndex, newKey) {
    const active = state.activeSession;
    if (!active || !active.items[itemIndex]) return;
    const item = active.items[itemIndex];
    if (!item.options.includes(newKey)) return;

    if (hasSessionProgress({ items: [{ exercise: item.exercise }] })) {
      if (!window.confirm('Ganti variasi akan mengosongkan data set gerakan ini. Lanjutkan?')) {
        render();
        return;
      }
    }

    item.key = newKey;
    item.exercise = buildExerciseEntry(newKey);
    render();
  }

  // ---------------------------------------------------------------------------
  // Timer istirahat
  // ---------------------------------------------------------------------------

  function getRestSeconds() {
    const value = toNumber(state.data && state.data.settings ? state.data.settings.restSeconds : null);
    return clamp(
      value === null ? REST_RULES.defaultSeconds : Math.round(value),
      REST_RULES.minSeconds,
      REST_RULES.maxSeconds
    );
  }

  function clearTimerInterval() {
    if (state.timer.intervalId) {
      window.clearInterval(state.timer.intervalId);
      state.timer.intervalId = null;
    }
  }

  function setRestTimer(seconds) {
    clearTimerInterval();
    const value = clamp(Math.round(seconds), REST_RULES.minSeconds, REST_RULES.maxSeconds);
    state.timer.total = value;
    state.timer.remaining = value;
    state.timer.endAt = null;
    state.timer.running = false;
    state.timer.finished = false;
  }

  function stopRestTimer() {
    clearTimerInterval();
    state.timer.running = false;
    state.timer.endAt = null;
  }

  function startRestTimer() {
    if (state.timer.running) return;
    if (state.timer.remaining <= 0) setRestTimer(state.timer.total);
    state.timer.finished = false;
    state.timer.running = true;
    state.timer.endAt = Date.now() + state.timer.remaining * 1000;
    clearTimerInterval();
    state.timer.intervalId = window.setInterval(tickRestTimer, 250);
    updateTimerDisplay();
  }

  function tickRestTimer() {
    if (!state.timer.running || !state.timer.endAt) return;
    const remaining = Math.max(0, Math.ceil((state.timer.endAt - Date.now()) / 1000));
    state.timer.remaining = remaining;
    if (remaining <= 0) {
      clearTimerInterval();
      state.timer.running = false;
      state.timer.finished = true;
      state.timer.endAt = null;
    }
    updateTimerDisplay();
  }

  function pauseRestTimer() {
    if (!state.timer.running) return;
    const remaining = Math.max(0, Math.ceil((state.timer.endAt - Date.now()) / 1000));
    clearTimerInterval();
    state.timer.remaining = remaining;
    state.timer.running = false;
    state.timer.endAt = null;
    updateTimerDisplay();
  }

  function resetRestTimer() {
    clearTimerInterval();
    state.timer.remaining = state.timer.total;
    state.timer.running = false;
    state.timer.finished = false;
    state.timer.endAt = null;
    updateTimerDisplay();
  }

  function updateTimerDisplay() {
    const display = document.getElementById('timer-display');
    if (!display) return;
    const clock = formatClock(state.timer.remaining);
    if (display.textContent !== clock) display.textContent = clock;

    const status = document.getElementById('timer-status');
    if (status) {
      let statusText = 'Siap';
      if (state.timer.finished) statusText = 'Istirahat selesai';
      else if (state.timer.running) statusText = 'Berjalan';
      else if (state.timer.remaining < state.timer.total) statusText = 'Jeda';
      if (status.textContent !== statusText) status.textContent = statusText;
    }

    const startButton = document.querySelector('[data-action="timer-start"]');
    const pauseButton = document.querySelector('[data-action="timer-pause"]');
    if (startButton) {
      let label = 'Mulai';
      if (state.timer.finished || state.timer.remaining <= 0) {
        label = 'Mulai lagi';
      } else if (!state.timer.running && state.timer.remaining < state.timer.total) {
        label = 'Lanjutkan';
      }
      if (startButton.textContent !== label) startButton.textContent = label;
      if (startButton.disabled !== state.timer.running) startButton.disabled = state.timer.running;
    }
    if (pauseButton) {
      const pauseDisabled = !state.timer.running;
      if (pauseButton.disabled !== pauseDisabled) pauseButton.disabled = pauseDisabled;
    }
  }

  function restSecondsOptions() {
    const values = [];
    for (let value = REST_RULES.minSeconds; value <= REST_RULES.maxSeconds; value += REST_RULES.stepSeconds) {
      values.push(value);
    }
    const current = getRestSeconds();
    if (!values.includes(current)) {
      values.push(current);
      values.sort(function (a, b) { return a - b; });
    }
    return values.map(function (value) {
      return '<option value="' + value + '"' + (value === current ? ' selected' : '') + '>' + value + ' dtk</option>';
    }).join('');
  }

  function setRestSecondsPreference(value) {
    const previous = getRestSeconds();
    const next = clamp(Math.round(value), REST_RULES.minSeconds, REST_RULES.maxSeconds);
    state.data.settings.restSeconds = next;
    if (!saveData()) {
      state.data.settings.restSeconds = previous;
      return false;
    }
    setRestTimer(next);
    return true;
  }

  // ---------------------------------------------------------------------------
  // Render: komponen bersama
  // ---------------------------------------------------------------------------

  function renderPageHead(eyebrow, title, dateText, subtitle) {
    return '<section class="page-head">'
      + '<p class="eyebrow">' + escapeHtml(eyebrow) + '</p>'
      + '<h1>' + escapeHtml(title) + '</h1>'
      + (dateText ? '<p class="page-date">' + escapeHtml(dateText) + '</p>' : '')
      + (subtitle ? '<p class="page-sub">' + escapeHtml(subtitle) + '</p>' : '')
      + '</section>';
  }

  function renderSuggestionCard(suggestion) {
    const failure = suggestion.type === 'failure';
    return '<article class="suggestion-card' + (failure ? ' is-failure' : '') + '">'
      + '<div class="suggestion-head">'
      + '<h3>' + escapeHtml(suggestion.name) + '</h3>'
      + '<span class="badge ' + (failure ? 'badge-failure' : 'badge-success') + '">'
      + (failure ? 'Perlu sesuaikan' : 'Naik level')
      + '</span>'
      + '</div>'
      + (suggestion.isToday ? '<span class="chip">Jadwal hari ini</span>' : '')
      + '<p>' + escapeHtml(suggestion.text) + '</p>'
      + '<button class="btn btn-small ' + (failure ? 'btn-outline-danger' : 'btn-secondary') + '" type="button" data-action="accept-suggestion" data-key="' + escapeHtml(suggestion.key) + '" aria-label="' + escapeHtml(suggestion.actionLabel + ' untuk ' + suggestion.name) + '">'
      + escapeHtml(suggestion.actionLabel)
      + '</button>'
      + '</article>';
  }

  function renderSuggestions() {
    const suggestions = getAllSuggestions();
    if (!suggestions.length) return '';
    return '<section class="section">'
      + '<div class="section-head"><h2>Saran Naik Level</h2><span class="pill">' + suggestions.length + '</span></div>'
      + '<div class="suggestion-list">' + suggestions.map(renderSuggestionCard).join('') + '</div>'
      + '</section>';
  }

  function renderSafetyNotes() {
    return '<section class="safety-card">'
      + '<h2>Catatan keamanan</h2>'
      + '<ul>' + PROGRAM.safetyNotes.map(function (note) { return '<li>' + escapeHtml(note) + '</li>'; }).join('') + '</ul>'
      + '</section>';
  }

  function planItemName(item) {
    const names = [exerciseName(item.key)];
    (item.alternatives || []).forEach(function (key) {
      names.push(exerciseName(key));
    });
    return names.join(' atau ');
  }

  function planItemMeta(item) {
    const def = getExerciseDef(item.key);
    if (!def) return '';
    if (item.alternatives && item.alternatives.length) {
      return def.sets + ' set · pilih variasi saat mulai';
    }
    return def.sets + ' set × ' + targetShortText(item.key);
  }

  function renderPlanCard(items) {
    const totalSets = items.reduce(function (total, item) {
      const def = getExerciseDef(item.key);
      return total + (def ? def.sets : 0);
    }, 0);

    return '<section class="card plan-card">'
      + '<div class="card-head">'
      + '<div><h2>Rencana latihan</h2><p class="muted">' + items.length + ' gerakan · ' + totalSets + ' set</p></div>'
      + '<span class="pill">' + escapeHtml(dayLabel(todayInfo().day)) + '</span>'
      + '</div>'
      + '<ol class="plan-list">'
      + items.map(function (item, index) {
        return '<li class="plan-item">'
          + '<span class="plan-num">' + (index + 1) + '</span>'
          + '<span class="plan-body"><strong>' + escapeHtml(planItemName(item)) + '</strong>'
          + '<span>' + escapeHtml(planItemMeta(item)) + '</span></span>'
          + '</li>';
      }).join('')
      + '</ol>'
      + '<button class="btn btn-primary btn-block" type="button" data-action="start-session">Mulai Sesi</button>'
      + '</section>';
  }

  function renderCompletionCard(session) {
    const stats = sessionStats(session);
    const duration = formatMinutesBetween(session.startedAt, session.finishedAt);
    const finished = formatTimeValue(session.finishedAt);
    const meta = [];
    if (finished) meta.push('Selesai ' + finished);
    if (duration) meta.push(duration);
    meta.push(stats.doneSets + '/' + stats.totalSets + ' set');

    return '<section class="card completion-card">'
      + '<span class="badge badge-success">Selesai</span>'
      + '<h2>Sesi hari ini sudah tercatat</h2>'
      + '<p class="muted">' + escapeHtml(meta.join(' · ')) + '</p>'
      + '<button class="btn btn-secondary btn-block" type="button" data-action="open-session" data-id="' + escapeHtml(session.id) + '">Lihat detail sesi</button>'
      + '</section>';
  }

  function renderNextSession() {
    const next = nextWorkoutInfo(new Date());
    if (!next) return '';
    const dateText = formatWeekday.format(next.date);
    return '<div class="next-session">'
      + '<span class="muted">Sesi berikutnya</span>'
      + '<strong>' + escapeHtml(capitalize(dateText)) + ' · ' + escapeHtml(next.schedule.title) + '</strong>'
      + '</div>';
  }

  // ---------------------------------------------------------------------------
  // Render: Hari Ini
  // ---------------------------------------------------------------------------

  function renderRestDay(info) {
    return '<section class="card rest-card">'
      + '<span class="rest-symbol" aria-hidden="true">☾</span>'
      + '<h2>Istirahat</h2>'
      + '<p>' + (info.schedule && info.schedule.title === 'Libur'
        ? 'Hari ini libur. Beri tubuh waktu untuk pulih.'
        : 'Tidak ada sesi terjadwal hari ini. Beri tubuh waktu untuk pulih.') + '</p>'
      + renderNextSession()
      + '</section>';
  }

  function renderJoggingPlan() {
    const level = getJoggingLevel();
    const total = JOGGING_RULES.totalMinutes;
    const run = level.target;
    const walk = Math.max(0, total - run);
    const formatLine = level.level === 1
      ? 'Format awal: jalan ' + JOGGING_RULES.initialWalkSegmentMinutes + ' menit, lari ' + JOGGING_RULES.initialRunSegmentMinutes + ' menit, ulangi ' + JOGGING_RULES.defaultIntervals + ' kali.'
      : 'Ganti ' + JOGGING_RULES.runIncrementMinutes + ' menit jalan dari level sebelumnya menjadi lari. Total tetap ' + total + ' menit.';

    return '<section class="card jog-plan">'
      + '<div class="card-head">'
      + '<div><h2>Rencana jogging</h2><p class="muted">Total ' + total + ' menit</p></div>'
      + '<span class="pill">Level ' + level.level + '</span>'
      + '</div>'
      + '<div class="jog-metrics">'
      + '<div class="metric"><strong>' + run + '</strong><span>menit lari</span></div>'
      + '<div class="metric"><strong>' + walk + '</strong><span>menit jalan</span></div>'
      + '</div>'
      + '<p class="hint">' + escapeHtml(formatLine) + '</p>'
      + '</section>';
  }

  function joggingForm() {
    const info = todayInfo();
    return '<section class="card form-card">'
      + '<div class="card-head"><div><h2>Catat jogging</h2><p class="muted">Simpan hasil sesi hari ini.</p></div></div>'
      + '<form data-form="jogging" novalidate>'
      + '<div class="field-grid">'
      + '<label class="field"><span>Tanggal</span><input class="input" type="date" name="date" value="' + info.dateKey + '" required></label>'
      + '<label class="field"><span>Durasi total (menit)</span><input class="input" type="number" name="durationMin" inputmode="numeric" min="1" max="600" step="1" value="' + JOGGING_RULES.totalMinutes + '" required></label>'
      + '<label class="field"><span>Jumlah interval</span><input class="input" type="number" name="intervals" inputmode="numeric" min="1" max="99" step="1" value="' + JOGGING_RULES.defaultIntervals + '" required></label>'
      + '<label class="field field-wide"><span>Catatan</span><input class="input" type="text" name="note" maxlength="200" placeholder="Contoh: lari terasa ringan"></label>'
      + '</div>'
      + '<button class="btn btn-primary btn-block" type="submit">Simpan Jogging</button>'
      + '</form>'
      + '</section>';
  }

  function renderJoggingLog(log, options) {
    const canDelete = options && options.canDelete;
    return '<article class="jog-row">'
      + '<div class="jog-row-main">'
      + '<strong>' + escapeHtml(formatJoggingDate(log.date)) + '</strong>'
      + '<span class="muted">' + log.durationMin + ' menit · ' + log.intervals + ' interval</span>'
      + (log.note ? '<p class="jog-note">' + escapeHtml(log.note) + '</p>' : '')
      + '</div>'
      + (canDelete
        ? '<button class="btn btn-ghost btn-small" type="button" data-action="delete-jogging" data-id="' + escapeHtml(log.id) + '" aria-label="Hapus jogging ' + escapeHtml(formatJoggingDate(log.date)) + '">Hapus</button>'
        : '')
      + '</article>';
  }

  function renderTodayJogging(logs) {
    if (!logs.length) return '';
    return '<section class="section">'
      + '<div class="section-head"><h2>Jogging hari ini</h2></div>'
      + '<div class="jog-list">' + logs.map(function (log) { return renderJoggingLog(log, { canDelete: false }); }).join('') + '</div>'
      + '</section>';
  }

  function renderToday() {
    const info = todayInfo();
    const schedule = info.schedule;
    const todaySessions = state.data.sessions.filter(function (session) {
      return session.date === info.dateKey;
    }).sort(function (a, b) { return sessionTimestamp(b) - sessionTimestamp(a); });
    const completed = todaySessions[0] || null;
    const dateText = formatDateLong.format(info.now);

    let headTitle = schedule ? schedule.title : 'Istirahat';
    let body = '';

    if (!schedule || schedule.type === 'rest') {
      headTitle = 'Istirahat';
      body = renderRestDay(info);
    } else if (schedule.type === 'jogging') {
      const todayLogs = state.data.joggingLog.filter(function (log) {
        return log.date === info.dateKey;
      }).sort(function (a, b) { return logTimestamp(b) - logTimestamp(a); });
      body = renderJoggingPlan()
        + joggingForm()
        + renderTodayJogging(todayLogs)
        + renderSuggestions()
        + renderSafetyNotes();
    } else {
      if (completed) {
        body = renderCompletionCard(completed);
      } else {
        body = renderPlanCard(schedule.items);
      }
      body += renderSuggestions();
      body += renderSafetyNotes();
    }

    if (!schedule || schedule.type === 'rest') {
      body += renderSuggestions();
    }

    return '<div class="view">'
      + renderPageHead('Hari Ini · ' + dayLabel(info.day), headTitle, capitalize(dateText))
      + body
      + '</div>';
  }

  // ---------------------------------------------------------------------------
  // Render: sesi berjalan
  // ---------------------------------------------------------------------------

  function renderTimerCard() {
    return '<section class="card timer-card">'
      + '<div class="timer-top">'
      + '<div><h2>Timer istirahat</h2><p class="muted">Jeda antar set.</p></div>'
      + '<label class="rest-select-label"><span>Durasi</span><select class="input rest-select" data-action="rest-seconds" aria-label="Durasi istirahat">' + restSecondsOptions() + '</select></label>'
      + '</div>'
      + '<div class="timer-main">'
      + '<output id="timer-display" class="timer-display" aria-label="Sisa waktu istirahat">' + formatClock(state.timer.remaining) + '</output>'
      + '<span id="timer-status" class="timer-status" aria-live="polite">Siap</span>'
      + '</div>'
      + '<div class="timer-buttons">'
      + '<button class="btn btn-primary btn-small" type="button" data-action="timer-start">Mulai</button>'
      + '<button class="btn btn-secondary btn-small" type="button" data-action="timer-pause">Jeda</button>'
      + '<button class="btn btn-ghost btn-small" type="button" data-action="timer-reset">Reset</button>'
      + '</div>'
      + '</section>';
  }

  function renderVariantSelect(item, itemIndex) {
    const options = item.options || [item.key];
    if (options.length < 2) return '';
    const optionMarkup = options.map(function (key) {
      return '<option value="' + escapeHtml(key) + '"' + (key === item.key ? ' selected' : '') + '>' + escapeHtml(exerciseName(key)) + '</option>';
    }).join('');
    return '<label class="variant-field"><span>Variasi</span>'
      + '<select class="input" data-action="variant" data-item="' + itemIndex + '">' + optionMarkup + '</select>'
      + '</label>';
  }

  function renderExerciseSets(item, itemIndex) {
    const def = getExerciseDef(item.exercise.key);
    if (!def) return '';
    const isPullup = def.progression.kind === 'pullup';
    const rows = item.exercise.sets.map(function (set, setIndex) {
      const inputValue = set.actual === null ? '' : String(set.actual);
      const descentValue = set.descent === null || set.descent === undefined ? '' : String(set.descent);
      const goalMet = set.done
        && toNumber(set.actual) !== null
        && toNumber(set.actual) >= set.target
        && (!isPullup || (toNumber(set.descent) !== null && toNumber(set.descent) >= set.descentTarget));
      return '<div class="set-block" data-set-block data-item="' + itemIndex + '" data-set="' + setIndex + '">'
        + '<div class="set-row' + (set.done ? ' is-done' : '') + (goalMet ? ' is-goal' : '') + '">'
        + '<label class="set-check"><input type="checkbox" data-action="toggle-set" data-item="' + itemIndex + '" data-set="' + setIndex + '" aria-label="Set ' + (setIndex + 1) + ' ' + escapeHtml(def.name) + '"' + (set.done ? ' checked' : '') + '><span>Set ' + (setIndex + 1) + '</span></label>'
        + '<span class="set-target">' + escapeHtml(String(set.target)) + ' ' + escapeHtml(def.unitShort) + '</span>'
        + '<span class="set-input-wrap">'
        + '<input class="set-input" type="number" inputmode="numeric" min="0" step="1" value="' + inputValue + '" placeholder="' + escapeHtml(String(set.target)) + '" data-action="set-actual" data-item="' + itemIndex + '" data-set="' + setIndex + '" aria-label="Aktual set ' + (setIndex + 1) + ' ' + escapeHtml(def.name) + '">'
        + '<span class="set-unit">' + escapeHtml(def.unitShort) + '</span>'
        + '</span>'
        + '</div>'
        + (isPullup
          ? '<label class="tempo-row"><span>Durasi turun</span><input class="tempo-input" type="number" inputmode="numeric" min="0" step="1" value="' + descentValue + '" placeholder="' + escapeHtml(String(set.descentTarget)) + '" data-action="set-descent" data-item="' + itemIndex + '" data-set="' + setIndex + '" aria-label="Durasi turun set ' + (setIndex + 1) + '"><span class="set-unit">detik</span><span class="tempo-target">target ' + escapeHtml(String(set.descentTarget)) + ' dtk</span></label>'
          : '')
        + '</div>';
    }).join('');

    return '<div class="set-list">' + rows + '</div>';
  }

  function renderExerciseCard(item, itemIndex) {
    const def = getExerciseDef(item.exercise.key);
    const exercise = item.exercise;
    const skipped = exercise.skipped;
    const displayName = def ? def.name : exerciseName(exercise.key);
    const targetLine = def ? targetShortText(exercise.key) : '';
    let hint = def && def.hint ? def.hint : '';
    if (def && def.progression.kind === 'pullup') {
      const level = getLevel(exercise.key);
      const requiredTempo = Math.max(level.tempo, def.progression.tempoMinSeconds);
      hint = 'Syarat naik level: semua set ' + def.progression.repsGoal + ' rep dengan turun minimal ' + requiredTempo + ' detik.';
    }

    const skipEditor = state.skipEditorIndex === itemIndex
      ? '<div class="skip-editor">'
        + '<label class="field"><span>Alasan singkat</span><input class="input" type="text" maxlength="120" data-skip-reason="' + itemIndex + '" placeholder="Contoh: sakit bahu"></label>'
        + '<div class="skip-actions">'
        + '<button class="btn btn-small btn-secondary" type="button" data-action="confirm-skip" data-item="' + itemIndex + '">Tandai dilewati</button>'
        + '<button class="btn btn-small btn-ghost" type="button" data-action="cancel-skip" data-item="' + itemIndex + '">Batal</button>'
        + '</div>'
        + '</div>'
      : '';

    return '<article class="card exercise-card' + (skipped ? ' is-skipped' : '') + '" data-exercise-card>'
      + '<div class="exercise-head">'
      + '<div class="exercise-title-wrap">'
      + '<span class="exercise-index">' + (itemIndex + 1) + '</span>'
      + '<div><h2>' + escapeHtml(displayName) + '</h2>'
      + '<p class="exercise-meta">' + (skipped ? 'Dilewati' : escapeHtml(def ? def.sets + ' set · target ' + targetLine : '')) + '</p>'
      + '</div>'
      + '</div>'
      + (skipped
        ? '<button class="btn btn-ghost btn-small" type="button" data-action="unskip" data-item="' + itemIndex + '" aria-label="Batalkan lewati ' + escapeHtml(displayName) + '">Batalkan</button>'
        : '<button class="btn btn-ghost btn-small" type="button" data-action="skip-exercise" data-item="' + itemIndex + '" aria-label="Lewati ' + escapeHtml(displayName) + '">Lewati</button>')
      + '</div>'
      + (hint && !skipped ? '<p class="exercise-hint">' + escapeHtml(hint) + '</p>' : '')
      + renderVariantSelect(item, itemIndex)
      + (skipped
        ? '<p class="skipped-note">Alasan: ' + escapeHtml(exercise.note || 'tidak ada alasan') + '</p>'
        : skipEditor + renderExerciseSets(item, itemIndex) + '<input class="input note-input" type="text" maxlength="200" value="' + escapeHtml(exercise.note) + '" placeholder="Catatan gerakan (opsional)" data-action="exercise-note" data-item="' + itemIndex + '" aria-label="Catatan ' + escapeHtml(displayName) + '">')
      + '</article>';
  }

  function renderSession() {
    const active = state.activeSession;
    const schedule = scheduleForDay(active.day);
    const title = schedule ? schedule.title : 'Sesi latihan';
    const sessionDate = dateFromKey(active.date) || new Date();
    const dateText = formatDateLong.format(sessionDate);

    return '<div class="view session-view">'
      + '<div class="session-top">'
      + '<button class="btn btn-ghost btn-small" type="button" data-action="cancel-session">← Batal</button>'
      + '<span class="pill">Sesi berjalan</span>'
      + '</div>'
      + renderPageHead('Sesi · ' + dayLabel(active.day), title, capitalize(dateText), 'Mulai ' + formatTimeValue(active.startedAt))
      + renderTimerCard()
      + '<div class="exercise-list">' + active.items.map(renderExerciseCard).join('') + '</div>'
      + '<div class="session-savebar">'
      + '<div id="session-progress" class="session-progress">' + escapeHtml(sessionProgressText()) + '</div>'
      + '<button class="btn btn-primary" type="button" data-action="finish-session">Selesai</button>'
      + '</div>'
      + '</div>';
  }

  function sessionProgressText() {
    const active = state.activeSession;
    if (!active) return '';
    let total = 0;
    let done = 0;
    let skipped = 0;
    active.items.forEach(function (item) {
      if (item.exercise.skipped) {
        skipped += 1;
        return;
      }
      total += item.exercise.sets.length;
      done += item.exercise.sets.filter(function (set) { return set.done; }).length;
    });
    return done + '/' + total + ' set' + (skipped ? ' · ' + skipped + ' dilewati' : '');
  }

  function updateSessionProgressDisplay() {
    const element = document.getElementById('session-progress');
    if (element) element.textContent = sessionProgressText();
  }

  function updateSetRow(itemIndex, setIndex) {
    const active = state.activeSession;
    if (!active) return;
    const item = active.items[itemIndex];
    if (!item) return;
    const set = item.exercise.sets[setIndex];
    if (!set) return;
    const row = document.querySelector('.set-block[data-item="' + itemIndex + '"][data-set="' + setIndex + '"] .set-row');
    if (!row) return;
    const def = getExerciseDef(item.exercise.key);
    const isPullup = def && def.progression.kind === 'pullup';
    const goalMet = set.done
      && toNumber(set.actual) !== null
      && toNumber(set.actual) >= set.target
      && (!isPullup || (toNumber(set.descent) !== null && toNumber(set.descent) >= set.descentTarget));
    row.classList.toggle('is-done', set.done);
    row.classList.toggle('is-goal', Boolean(goalMet));
  }

  // ---------------------------------------------------------------------------
  // Render: Riwayat
  // ---------------------------------------------------------------------------

  function renderHistoryRow(session) {
    const stats = sessionStats(session);
    const schedule = scheduleForDay(session.day);
    const title = schedule ? schedule.title : 'Sesi latihan';
    const duration = formatMinutesBetween(session.startedAt, session.finishedAt);
    const timeRange = formatTimeValue(session.startedAt) && formatTimeValue(session.finishedAt)
      ? formatTimeValue(session.startedAt) + '–' + formatTimeValue(session.finishedAt)
      : '';
    const meta = [];
    if (timeRange) meta.push(timeRange);
    if (duration) meta.push(duration);
    meta.push(stats.doneSets + '/' + stats.totalSets + ' set');
    if (stats.skipped) meta.push(stats.skipped + ' dilewati');

    return '<button class="history-row" type="button" data-action="open-session" data-id="' + escapeHtml(session.id) + '">'
      + '<span class="history-date">'
      + '<span class="history-day">' + escapeHtml(dayLabel(session.day).slice(0, 3)) + '</span>'
      + '<span class="history-daynum">' + escapeHtml(String((dateFromKey(session.date) || new Date()).getDate())) + '</span>'
      + '</span>'
      + '<span class="history-main">'
      + '<strong>' + escapeHtml(title) + '</strong>'
      + '<span class="history-meta">' + escapeHtml(formatSessionDateShort(session.date)) + '</span>'
      + '<span class="history-meta">' + escapeHtml(meta.join(' · ')) + '</span>'
      + '</span>'
      + '<span class="chevron" aria-hidden="true">›</span>'
      + '</button>';
  }

  function renderHistory() {
    const sessions = sortedSessionsNewest();
    const logs = sortedJoggingNewest();

    const sessionContent = sessions.length
      ? '<div class="history-list">' + sessions.map(renderHistoryRow).join('') + '</div>'
      : '<div class="empty-state"><p>Belum ada sesi latihan.</p><button class="btn btn-secondary btn-small" type="button" data-action="go-today">Buka Hari Ini</button></div>';

    const logContent = logs.length
      ? '<div class="jog-list">' + logs.map(function (log) { return renderJoggingLog(log, { canDelete: true }); }).join('') + '</div>'
      : '<div class="empty-state"><p>Belum ada catatan jogging.</p></div>';

    return '<div class="view">'
      + renderPageHead('Riwayat', 'Semua catatan', '', 'Sesi terbaru tampil paling atas.')
      + '<section class="section">'
      + '<div class="section-head"><h2>Sesi latihan</h2><span class="pill">' + sessions.length + '</span></div>'
      + sessionContent
      + '</section>'
      + '<section class="section">'
      + '<div class="section-head"><h2>Jogging</h2><span class="pill">' + logs.length + '</span></div>'
      + logContent
      + '</section>'
      + '</div>';
  }

  function resultRowForSet(set, def, index) {
    const actual = set.actual === null || set.actual === undefined ? '—' : String(set.actual);
    const unitShort = def ? def.unitShort : (set.unit === 'detik' ? 'dtk' : 'rep');
    const isPullup = def && def.progression.kind === 'pullup';
    const targetMet = set.done
      && toNumber(set.actual) !== null
      && toNumber(set.actual) >= set.target
      && (!isPullup || (toNumber(set.descent) !== null && toNumber(set.descent) >= set.descentTarget));
    const status = !set.done ? '—' : (targetMet ? '✓' : '✕');
    const statusClass = !set.done ? 'is-neutral' : (targetMet ? 'is-ok' : 'is-fail');
    const descent = isPullup
      ? ' · turun ' + (set.descent === null || set.descent === undefined ? '—' : set.descent) + '/' + (set.descentTarget === null || set.descentTarget === undefined ? '—' : set.descentTarget) + ' dtk'
      : '';

    return '<li class="result-row">'
      + '<span class="result-set">Set ' + (index + 1) + '</span>'
      + '<span class="result-value">' + escapeHtml(actual) + ' / ' + escapeHtml(String(set.target)) + ' ' + escapeHtml(unitShort) + escapeHtml(descent) + '</span>'
      + '<span class="result-status ' + statusClass + '" aria-label="' + (status === '✓' ? 'target tercapai' : (status === '✕' ? 'target belum tercapai' : 'tidak dikerjakan')) + '">' + status + '</span>'
      + '</li>';
  }

  function renderHistoryDetail() {
    const session = getSessionById(state.historyDetailId);
    if (!session) {
      state.historyDetailId = null;
      return renderHistory();
    }

    const stats = sessionStats(session);
    const schedule = scheduleForDay(session.day);
    const title = schedule ? schedule.title : 'Sesi latihan';
    const duration = formatMinutesBetween(session.startedAt, session.finishedAt);
    const timeRange = formatTimeValue(session.startedAt) && formatTimeValue(session.finishedAt)
      ? formatTimeValue(session.startedAt) + '–' + formatTimeValue(session.finishedAt)
      : '';

    const exerciseCards = (session.exercises || []).map(function (exercise, index) {
      const def = getExerciseDef(exercise.key);
      const skipped = exercise.skipped;
      const suggestion = skipped ? null : getSuggestionForExercise(exercise.key);
      const name = def ? def.name : exerciseName(exercise.key);
      return '<article class="card detail-exercise' + (skipped ? ' is-skipped' : '') + '">'
        + '<div class="card-head">'
        + '<div><h2>' + (index + 1) + '. ' + escapeHtml(name) + '</h2>'
        + '<p class="muted">' + (skipped ? 'Dilewati' : escapeHtml((exercise.sets || []).length + ' set')) + '</p></div>'
        + (skipped ? '<span class="badge badge-muted">Dilewati</span>' : '')
        + '</div>'
        + (skipped
          ? '<p class="skipped-note">Alasan: ' + escapeHtml(exercise.note || 'tidak ada alasan') + '</p>'
          : '<ul class="result-list">' + (exercise.sets || []).map(function (set, setIndex) {
            return resultRowForSet(set, def, setIndex);
          }).join('') + '</ul>')
        + (!skipped && exercise.note ? '<p class="note-text">Catatan: ' + escapeHtml(exercise.note) + '</p>' : '')
        + (suggestion ? '<p class="inline-suggestion"><strong>Saran saat ini:</strong> ' + escapeHtml(suggestion.text) + '</p>' : '')
        + '</article>';
    }).join('');

    const statParts = [];
    if (duration) statParts.push(duration);
    if (timeRange) statParts.push(timeRange);
    statParts.push(stats.doneSets + '/' + stats.totalSets + ' set');
    if (stats.skipped) statParts.push(stats.skipped + ' dilewati');

    return '<div class="view">'
      + '<button class="btn btn-ghost btn-small back-btn" type="button" data-action="back-history">← Riwayat</button>'
      + renderPageHead('Detail sesi · ' + dayLabel(session.day), title, formatSessionDateShort(session.date), '')
      + '<div class="stat-row">' + statParts.map(function (part) {
        return '<span class="stat-pill">' + escapeHtml(part) + '</span>';
      }).join('') + '</div>'
      + '<div class="exercise-list">' + exerciseCards + '</div>'
      + '<button class="btn btn-outline-danger btn-block" type="button" data-action="delete-session" data-id="' + escapeHtml(session.id) + '" aria-label="Hapus sesi ' + escapeHtml(formatSessionDateShort(session.date)) + '">Hapus Sesi Ini</button>'
      + '</div>';
  }

  // ---------------------------------------------------------------------------
  // Render: Progres
  // ---------------------------------------------------------------------------

  function bestExerciseMetric(key) {
    let best = null;
    let bestDescent = null;
    state.data.sessions.forEach(function (session) {
      (session.exercises || []).forEach(function (exercise) {
        if (exercise.key !== key || exercise.skipped) return;
        (exercise.sets || []).forEach(function (set) {
          if (!set.done) return;
          const actual = toNumber(set.actual);
          if (actual !== null && actual > 0 && (!best || actual > best.value)) {
            best = { value: actual, date: session.date };
          }
          const descent = toNumber(set.descent);
          if (descent !== null && descent > 0 && (!bestDescent || descent > bestDescent.value)) {
            bestDescent = { value: descent, date: session.date };
          }
        });
      });
    });
    return { best: best, bestDescent: bestDescent };
  }

  function getChartPoints(key) {
    const points = [];
    sortedSessionsNewest().forEach(function (session) {
      let max = null;
      (session.exercises || []).forEach(function (exercise) {
        if (exercise.key !== key || exercise.skipped) return;
        (exercise.sets || []).forEach(function (set) {
          if (!set.done) return;
          const actual = toNumber(set.actual);
          if (actual !== null && actual > 0 && (max === null || actual > max)) max = actual;
        });
      });
      if (max !== null) {
        points.push({
          value: max,
          date: session.date,
          timestamp: sessionTimestamp(session),
          label: dateFromKey(session.date) ? formatDateCompact.format(dateFromKey(session.date)) : session.date,
        });
      }
    });
    points.sort(function (a, b) {
      return a.timestamp - b.timestamp;
    });
    return points.slice(-PROGRAM.rules.chartSessionCount);
  }

  function niceMax(value) {
    if (value <= 0) return 1;
    const padded = value * 1.1;
    const magnitude = Math.pow(10, Math.floor(Math.log10(padded)));
    const normalized = padded / magnitude;
    const steps = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
    const nice = steps.find(function (step) { return step >= normalized; }) || 10;
    return nice * magnitude;
  }

  function renderChart(points, def) {
    if (!points.length) {
      return '<div class="empty-chart"><p>Belum ada data untuk gerakan ini.</p></div>';
    }

    const width = 340;
    const height = 200;
    const left = 32;
    const right = 10;
    const top = 20;
    const bottom = 34;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const maxValue = niceMax(Math.max.apply(null, points.map(function (point) { return point.value; })));
    const step = plotWidth / points.length;
    const barWidth = Math.min(38, step * 0.56);
    const unit = def ? def.unitShort : '';
    const aria = (def ? def.name : 'Gerakan') + ': ' + points.map(function (point) {
      return point.label + ' ' + point.value + ' ' + unit;
    }).join(', ');

    const grid = [0, 0.5, 1].map(function (fraction) {
      const y = top + plotHeight - fraction * plotHeight;
      const value = Math.round(maxValue * fraction);
      return '<line class="chart-grid" x1="' + left + '" y1="' + y + '" x2="' + (width - right) + '" y2="' + y + '"></line>'
        + '<text class="chart-axis-label" x="' + (left - 6) + '" y="' + (y + 3) + '" text-anchor="end">' + value + '</text>';
    }).join('');

    const bars = points.map(function (point, index) {
      const barHeight = Math.max(2, (point.value / maxValue) * plotHeight);
      const x = left + index * step + (step - barWidth) / 2;
      const y = top + plotHeight - barHeight;
      const center = left + index * step + step / 2;
      return '<g>'
        + '<rect class="chart-bar" x="' + x + '" y="' + y + '" width="' + barWidth + '" height="' + barHeight + '" rx="4"></rect>'
        + '<text class="chart-value" x="' + center + '" y="' + (y - 6) + '" text-anchor="middle">' + point.value + '</text>'
        + '<text class="chart-date" x="' + center + '" y="' + (height - 12) + '" text-anchor="middle">' + escapeHtml(point.label) + '</text>'
        + '</g>';
    }).join('');

    return '<div class="chart-wrap">'
      + '<svg class="bar-chart" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="' + escapeHtml(aria) + '">'
      + grid + bars
      + '</svg>'
      + '</div>';
  }

  function renderPullupPanel() {
    const negative = bestExerciseMetric('negative-pull-up');
    const deadHang = bestExerciseMetric('dead-hang');
    const marked = state.data.settings.fullPullUpAt;
    const markedDate = marked ? formatDateDayMonthYear.format(new Date(marked)) : '';
    const negativeText = negative.best ? negative.best.value + ' rep' : '—';
    const deadHangText = deadHang.best ? deadHang.best.value + ' dtk' : '—';
    const descentText = negative.bestDescent ? 'turun ' + negative.bestDescent.value + ' dtk' : 'belum ada data';

    return '<section class="card pullup-card">'
      + '<div class="card-head"><div><h2>Target Pull-up</h2><p class="muted">Menuju pull-up penuh pertama.</p></div><span class="badge badge-success">Fokus</span></div>'
      + '<div class="stat-grid">'
      + '<div class="stat"><span>Negative terbaik</span><strong>' + escapeHtml(negativeText) + '</strong><small>' + escapeHtml(descentText) + '</small></div>'
      + '<div class="stat"><span>Dead hang terbaik</span><strong>' + escapeHtml(deadHangText) + '</strong><small>genggaman</small></div>'
      + '<div class="stat"><span>Pull-up penuh</span><strong>' + (marked ? 'Sudah' : 'Belum') + '</strong><small>' + (marked ? escapeHtml(markedDate) : 'terus berlatih') + '</small></div>'
      + '</div>'
      + '<div class="pullup-action">'
      + (marked
        ? '<button class="btn btn-ghost btn-small" type="button" data-action="unmark-pullup">Batalkan tanda pull-up penuh</button>'
        : '<button class="btn btn-secondary btn-block" type="button" data-action="mark-pullup">Tandai sudah pull-up penuh</button>')
      + '</div>'
      + '</section>';
  }

  function renderProgress() {
    const chartCount = PROGRAM.rules.chartSessionCount;
    let selected = state.selectedExercise;
    if (!getExerciseDef(selected)) {
      selected = PROGRAM.exerciseOrder[0];
      state.selectedExercise = selected;
    }
    const def = getExerciseDef(selected);
    const points = getChartPoints(selected);
    const level = getLevel(selected);
    const suggestion = getSuggestionForExercise(selected);
    const options = PROGRAM.exerciseOrder.map(function (key) {
      const itemDef = getExerciseDef(key);
      return '<option value="' + escapeHtml(key) + '"' + (key === selected ? ' selected' : '') + '>' + escapeHtml(itemDef.name) + '</option>';
    }).join('');

    return '<div class="view">'
      + renderPageHead('Progres', 'Perkembangan', '', 'Nilai terbaik tiap sesi, maksimal ' + chartCount + ' sesi terakhir.')
      + renderPullupPanel()
      + '<section class="card chart-card">'
      + '<div class="chart-head">'
      + '<div><h2>' + escapeHtml(def.name) + '</h2><p class="muted">Target aktif: ' + escapeHtml(targetText(level.target, def)) + (def.progression.kind === 'pullup' ? ' · turun ' + level.tempo + ' dtk' : '') + (def.progression.kind === 'incline' ? ' · variasi ' + level.stage : '') + '</p></div>'
      + '<label class="chart-select"><span>Gerakan</span><select class="input" data-action="select-exercise">' + options + '</select></label>'
      + '</div>'
      + renderChart(points, def)
      + '<p class="chart-note">' + escapeHtml(def.name) + ' · nilai maksimal per sesi · ' + chartCount + ' sesi terakhir.</p>'
      + (suggestion ? '<p class="inline-suggestion"><strong>Saran saat ini:</strong> ' + escapeHtml(suggestion.text) + '</p>' : '')
      + '</section>'
      + '</div>';
  }

  // ---------------------------------------------------------------------------
  // Render: Pengaturan
  // ---------------------------------------------------------------------------

  function renderSettings() {
    const rest = getRestSeconds();
    return '<div class="view">'
      + renderPageHead('Pengaturan', 'Data & preferensi', '', 'Semua data tersimpan di browser ini.')
      + '<section class="card">'
      + '<div class="card-head"><div><h2>Timer istirahat</h2><p class="muted">Jeda default antar set.</p></div></div>'
      + '<label class="field rest-field"><span>Durasi istirahat (detik)</span><input class="input" type="number" min="' + REST_RULES.minSeconds + '" max="' + REST_RULES.maxSeconds + '" step="' + REST_RULES.stepSeconds + '" value="' + rest + '" data-action="settings-rest" inputmode="numeric"></label>'
      + '<p class="hint">Bisa diatur ' + REST_RULES.minSeconds + '–' + REST_RULES.maxSeconds + ' detik. Bisa juga diubah saat sesi berjalan. Perubahan tersimpan otomatis.</p>'
      + '</section>'
      + '<section class="card">'
      + '<div class="card-head"><div><h2>Backup data</h2><p class="muted">Ekspor cadangan secara rutin.</p></div></div>'
      + '<p class="body-text">File backup berisi sesi latihan, jogging, target aktif, dan pengaturan. Simpan file di tempat aman.</p>'
      + '<button class="btn btn-primary btn-block" type="button" data-action="export-data">Export Data</button>'
      + '<div class="file-picker-row">'
      + '<input id="import-file" type="file" accept=".json,application/json" hidden>'
      + '<button class="btn btn-secondary" type="button" data-action="choose-import-file">Pilih File</button>'
      + '<span class="file-name" id="import-filename">Belum ada file</span>'
      + '</div>'
      + '<button class="btn btn-secondary btn-block" type="button" data-action="import-data">Import Data</button>'
      + '<p class="hint">Import akan menggantikan seluruh data yang ada setelah konfirmasi.</p>'
      + '</section>'
      + '<section class="card danger-card">'
      + '<div class="card-head"><div><h2>Hapus semua data</h2><p class="muted">Tindakan ini tidak bisa dibatalkan.</p></div></div>'
      + '<p class="body-text">Ekspor data terlebih dahulu jika masih diperlukan.</p>'
      + '<button class="btn btn-danger btn-block" type="button" data-action="delete-all">Hapus Semua Data</button>'
      + '</section>'
      + '</div>';
  }

  function renderStorageError() {
    return '<div class="view">'
      + '<section class="card error-card">'
      + '<span class="badge badge-failure">Data tidak dimuat</span>'
      + '<h1>Data tersimpan tidak bisa dibuka</h1>'
      + '<p>' + escapeHtml(state.storageError) + '</p>'
      + '<p class="muted">Data lama tidak akan ditimpa otomatis. Unduh data mentah jika ingin menyelamatkannya, atau mulai baru dengan menghapusnya.</p>'
      + '<div class="error-actions">'
      + (state.rawStorage ? '<button class="btn btn-secondary btn-block" type="button" data-action="download-raw">Unduh Data Mentah</button>' : '')
      + '<button class="btn btn-danger btn-block" type="button" data-action="reset-storage">Hapus Data &amp; Mulai Baru</button>'
      + '</div>'
      + '</section>'
      + '</div>';
  }

  // ---------------------------------------------------------------------------
  // Render utama
  // ---------------------------------------------------------------------------

  function updateNavigation() {
    const nav = document.getElementById('bottom-nav');
    if (!nav) return;

    const hideNav = Boolean(state.activeSession || state.storageError);
    nav.hidden = hideNav;
    nav.querySelectorAll('.nav-btn').forEach(function (button) {
      const active = !hideNav && button.dataset.view === state.view;
      button.classList.toggle('is-active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
  }

  function render() {
    const main = document.getElementById('app-main');
    if (!main) return;

    if (state.storageError) {
      main.innerHTML = renderStorageError();
      updateNavigation();
      return;
    }

    if (!state.data) state.data = createEmptyData();

    if (state.activeSession) {
      main.innerHTML = renderSession();
    } else if (state.view === 'history') {
      main.innerHTML = state.historyDetailId ? renderHistoryDetail() : renderHistory();
    } else if (state.view === 'progress') {
      main.innerHTML = renderProgress();
    } else if (state.view === 'settings') {
      main.innerHTML = renderSettings();
    } else {
      main.innerHTML = renderToday();
    }

    updateNavigation();
    if (state.activeSession) updateTimerDisplay();
  }

  // ---------------------------------------------------------------------------
  // Aksi pengguna
  // ---------------------------------------------------------------------------

  function showToast(message, type) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    if (state.toastTimeout) window.clearTimeout(state.toastTimeout);
    toast.textContent = message;
    toast.className = 'toast is-visible' + (type === 'error' ? ' toast--error' : '');
    state.toastTimeout = window.setTimeout(function () {
      toast.classList.remove('is-visible');
    }, 3600);
  }

  function downloadText(text, filename, mimeType) {
    const blob = new Blob([text], { type: mimeType || 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function exportData() {
    const filename = PROGRAM.backupPrefix + '-' + localDateKey() + '.json';
    downloadText(JSON.stringify(state.data, null, 2), filename, 'application/json');
    showToast('Backup diunduh: ' + filename);
  }

  function validateImport(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error('Isi file bukan objek data.');
    }
    if (raw.version !== DATA_VERSION) {
      throw new Error('Versi data di file (' + String(raw.version) + ') tidak cocok dengan versi aplikasi (' + DATA_VERSION + ').');
    }
    if (!Array.isArray(raw.sessions) || !Array.isArray(raw.joggingLog)) {
      throw new Error('Struktur sesi atau jogging tidak dikenali.');
    }
    const normalized = normalizeData(raw);
    if (!normalized) throw new Error('Data di file tidak bisa dibaca.');
    return normalized;
  }

  function importData() {
    const input = document.getElementById('import-file');
    if (!input || !input.files || !input.files[0]) {
      showToast('Pilih file backup terlebih dahulu.', 'error');
      return;
    }

    const file = input.files[0];
    if (file.size > 5 * 1024 * 1024) {
      showToast('File terlalu besar. Maksimal 5 MB.', 'error');
      input.value = '';
      const fileName = document.getElementById('import-filename');
      if (fileName) fileName.textContent = 'Belum ada file';
      return;
    }

    file.text().then(function (text) {
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch (error) {
        throw new Error('File bukan JSON yang valid.');
      }
      return validateImport(parsed);
    }).then(function (normalized) {
      if (!window.confirm('Impor data ini? Seluruh data yang ada sekarang akan diganti.')) {
        return;
      }
      const previous = state.data;
      state.data = normalized;
      if (!saveData()) {
        state.data = previous;
        return;
      }
      stopRestTimer();
      setRestTimer(getRestSeconds());
      state.activeSession = null;
      state.skipEditorIndex = null;
      state.historyDetailId = null;
      state.view = 'today';
      state.selectedExercise = PROGRAM.exerciseOrder[0];
      render();
      window.scrollTo(0, 0);
      showToast('Data berhasil diimpor.');
    }).catch(function (error) {
      showToast('Import gagal: ' + error.message, 'error');
      const currentInput = document.getElementById('import-file');
      if (currentInput) currentInput.value = '';
      const fileName = document.getElementById('import-filename');
      if (fileName) fileName.textContent = 'Belum ada file';
    });
  }

  function deleteAllData() {
    if (!window.confirm('Hapus SEMUA data latihan, jogging, level, dan pengaturan?')) return;
    if (!window.confirm('Yakin? Tindakan ini tidak bisa dibatalkan. Ekspor data dulu jika perlu.')) return;

    const previousData = state.data;
    stopRestTimer();
    state.data = createEmptyData();
    state.activeSession = null;
    state.skipEditorIndex = null;
    state.historyDetailId = null;
    state.selectedExercise = PROGRAM.exerciseOrder[0];
    setRestTimer(REST_RULES.defaultSeconds);

    if (!saveData()) {
      state.data = previousData;
      setRestTimer(getRestSeconds());
      return;
    }
    render();
    window.scrollTo(0, 0);
    showToast('Semua data sudah dihapus.');
  }

  function markPullUp() {
    const previous = state.data.settings.fullPullUpAt;
    state.data.settings.fullPullUpAt = new Date().toISOString();
    if (!saveData()) {
      state.data.settings.fullPullUpAt = previous;
      return;
    }
    render();
    showToast('Pull-up penuh pertama tercatat. Mantap!');
  }

  function unmarkPullUp() {
    if (!window.confirm('Batalkan tanda pull-up penuh?')) return;
    const previous = state.data.settings.fullPullUpAt;
    state.data.settings.fullPullUpAt = null;
    if (!saveData()) {
      state.data.settings.fullPullUpAt = previous;
      return;
    }
    render();
    showToast('Tanda pull-up penuh dibatalkan.');
  }

  function deleteSession(id) {
    const session = getSessionById(id);
    if (!session) return;
    if (!window.confirm('Hapus sesi ' + formatSessionDateShort(session.date) + '? Tindakan ini tidak bisa dibatalkan.')) return;
    state.data.sessions = state.data.sessions.filter(function (item) { return item.id !== id; });
    if (!saveData()) {
      loadData();
      render();
      return;
    }
    state.historyDetailId = null;
    state.view = 'history';
    render();
    window.scrollTo(0, 0);
    showToast('Sesi dihapus.');
  }

  function deleteJoggingLog(id) {
    const log = state.data.joggingLog.find(function (item) { return item.id === id; });
    if (!log) return;
    if (!window.confirm('Hapus catatan jogging ' + formatJoggingDate(log.date) + '?')) return;
    state.data.joggingLog = state.data.joggingLog.filter(function (item) { return item.id !== id; });
    if (!saveData()) {
      loadData();
      render();
      return;
    }
    render();
    showToast('Catatan jogging dihapus.');
  }

  function goToday() {
    state.view = 'today';
    state.historyDetailId = null;
    render();
    window.scrollTo(0, 0);
  }

  function navigate(view) {
    if (!['today', 'history', 'progress', 'settings'].includes(view)) return;
    state.view = view;
    state.historyDetailId = null;
    render();
    window.scrollTo(0, 0);
  }

  function handleTimerStart() {
    startRestTimer();
  }

  function handleConfirmSkip(itemIndex) {
    const active = state.activeSession;
    if (!active || !active.items[itemIndex]) return;
    const input = document.querySelector('[data-skip-reason="' + itemIndex + '"]');
    const reason = input ? input.value.trim() : '';
    if (!reason) {
      showToast('Tulis alasan singkat sebelum melewati gerakan.', 'error');
      if (input) input.focus();
      return;
    }
    active.items[itemIndex].exercise.skipped = true;
    active.items[itemIndex].exercise.note = reason;
    state.skipEditorIndex = null;
    render();
  }

  function handleUnskip(itemIndex) {
    const active = state.activeSession;
    if (!active || !active.items[itemIndex]) return;
    active.items[itemIndex].exercise.skipped = false;
    active.items[itemIndex].exercise.note = '';
    render();
  }

  function handleJoggingSubmit(form) {
    const formData = new FormData(form);
    const date = String(formData.get('date') || '');
    const durationMin = toNumber(formData.get('durationMin'));
    const intervals = toNumber(formData.get('intervals'));
    const note = String(formData.get('note') || '').trim();

    if (!dateFromKey(date)) {
      showToast('Tanggal jogging belum valid.', 'error');
      return;
    }
    if (durationMin === null || durationMin <= 0) {
      showToast('Durasi total harus lebih dari 0 menit.', 'error');
      return;
    }
    if (intervals === null || intervals < 1) {
      showToast('Jumlah interval minimal 1.', 'error');
      return;
    }

    const log = {
      id: 'jogging-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
      date: date,
      durationMin: Math.round(durationMin),
      intervals: Math.round(intervals),
      note: note,
      createdAt: new Date().toISOString(),
    };

    state.data.joggingLog.push(log);
    if (!saveData()) {
      state.data.joggingLog.pop();
      return;
    }
    render();
    showToast('Jogging tersimpan.');
  }

  function handleSetActual(input, itemIndex, setIndex) {
    const active = state.activeSession;
    if (!active || !active.items[itemIndex]) return;
    const set = active.items[itemIndex].exercise.sets[setIndex];
    if (!set) return;

    const raw = input.value.trim();
    const value = raw === '' ? null : Number(raw);
    if (value !== null && (!Number.isFinite(value) || value < 0)) return;
    set.actual = value;
    set.done = value !== null;

    const block = input.closest('.set-block');
    if (block) {
      const checkbox = block.querySelector('input[data-action="toggle-set"]');
      if (checkbox) checkbox.checked = set.done;
    }
    updateSetRow(itemIndex, setIndex);
    updateSessionProgressDisplay();
  }

  function handleSetDescent(input, itemIndex, setIndex) {
    const active = state.activeSession;
    if (!active || !active.items[itemIndex]) return;
    const set = active.items[itemIndex].exercise.sets[setIndex];
    if (!set) return;
    const raw = input.value.trim();
    const value = raw === '' ? null : Number(raw);
    if (value !== null && (!Number.isFinite(value) || value < 0)) return;
    set.descent = value;
    updateSetRow(itemIndex, setIndex);
  }

  function handleToggleSet(checkbox, itemIndex, setIndex) {
    const active = state.activeSession;
    if (!active || !active.items[itemIndex]) return;
    const item = active.items[itemIndex];
    const set = item.exercise.sets[setIndex];
    if (!set) return;

    set.done = checkbox.checked;
    const block = checkbox.closest('.set-block');
    if (checkbox.checked) {
      if (set.actual === null) {
        set.actual = set.target;
        const actualInput = block ? block.querySelector('input[data-action="set-actual"]') : null;
        if (actualInput) actualInput.value = String(set.target);
      }
      if (set.descentTarget !== undefined && (set.descent === null || set.descent === undefined)) {
        set.descent = set.descentTarget;
        const descentInput = block ? block.querySelector('input[data-action="set-descent"]') : null;
        if (descentInput) descentInput.value = String(set.descentTarget);
      }
    }
    updateSetRow(itemIndex, setIndex);
    updateSessionProgressDisplay();
  }

  function handleRestSecondsSelect(select) {
    const value = Number(select.value);
    if (!Number.isFinite(value)) return;
    if (setRestSecondsPreference(value)) {
      updateTimerDisplay();
    } else {
      select.value = String(getRestSeconds());
    }
  }

  function handleSettingsRestInput(input) {
    const raw = Number(input.value);
    const value = Number.isFinite(raw)
      ? clamp(Math.round(raw), REST_RULES.minSeconds, REST_RULES.maxSeconds)
      : getRestSeconds();
    input.value = String(value);
    if (value !== getRestSeconds()) {
      if (!setRestSecondsPreference(value)) {
        input.value = String(getRestSeconds());
        return;
      }
      showToast('Timer istirahat disetel ke ' + value + ' detik.');
    } else {
      setRestTimer(value);
    }
  }

  function handleDownloadRaw() {
    if (!state.rawStorage) {
      showToast('Tidak ada data mentah yang bisa diunduh.', 'error');
      return;
    }
    const filename = PROGRAM.backupPrefix + '-raw-' + localDateKey() + '.json';
    downloadText(state.rawStorage, filename, 'application/json');
    showToast('Data mentah diunduh.');
  }

  function resetStorage() {
    if (!window.confirm('Hapus data tersimpan yang tidak bisa dibuka dan mulai dengan data kosong?')) return;
    state.storageError = null;
    state.rawStorage = null;
    state.data = createEmptyData();
    state.activeSession = null;
    state.skipEditorIndex = null;
    state.historyDetailId = null;
    state.selectedExercise = PROGRAM.exerciseOrder[0];
    setRestTimer(REST_RULES.defaultSeconds);
    if (!saveData()) {
      state.storageError = 'Gagal menyiapkan penyimpanan baru. Periksa izin penyimpanan browser.';
      render();
      return;
    }
    state.view = 'today';
    render();
    window.scrollTo(0, 0);
    showToast('Data baru siap digunakan.');
  }

  function handleAcceptSuggestion(key) {
    acceptSuggestion(key);
  }

  // ---------------------------------------------------------------------------
  // Event listener
  // ---------------------------------------------------------------------------

  function handleMainClick(event) {
    const actionElement = event.target.closest('[data-action]');
    if (!actionElement) return;
    const action = actionElement.dataset.action;

    switch (action) {
      case 'start-session':
        createActiveSession();
        break;
      case 'cancel-session':
        if (state.activeSession && hasSessionProgress(state.activeSession)
          && !window.confirm('Batal sesi? Data yang sudah diisi akan hilang.')) return;
        discardActiveSession();
        break;
      case 'finish-session':
        saveActiveSession();
        break;
      case 'timer-start':
        handleTimerStart();
        break;
      case 'timer-pause':
        pauseRestTimer();
        break;
      case 'timer-reset':
        resetRestTimer();
        break;
      case 'skip-exercise':
        state.skipEditorIndex = Number(actionElement.dataset.item);
        render();
        break;
      case 'cancel-skip':
        state.skipEditorIndex = null;
        render();
        break;
      case 'confirm-skip':
        handleConfirmSkip(Number(actionElement.dataset.item));
        break;
      case 'unskip':
        handleUnskip(Number(actionElement.dataset.item));
        break;
      case 'accept-suggestion':
        handleAcceptSuggestion(actionElement.dataset.key);
        break;
      case 'open-session':
        state.historyDetailId = actionElement.dataset.id;
        state.view = 'history';
        render();
        window.scrollTo(0, 0);
        break;
      case 'back-history':
        state.historyDetailId = null;
        render();
        window.scrollTo(0, 0);
        break;
      case 'delete-session':
        deleteSession(actionElement.dataset.id);
        break;
      case 'delete-jogging':
        deleteJoggingLog(actionElement.dataset.id);
        break;
      case 'mark-pullup':
        markPullUp();
        break;
      case 'unmark-pullup':
        unmarkPullUp();
        break;
      case 'export-data':
        exportData();
        break;
      case 'choose-import-file':
        {
          const fileInput = document.getElementById('import-file');
          if (fileInput) fileInput.click();
        }
        break;
      case 'import-data':
        importData();
        break;
      case 'delete-all':
        deleteAllData();
        break;
      case 'download-raw':
        handleDownloadRaw();
        break;
      case 'reset-storage':
        resetStorage();
        break;
      case 'go-today':
        goToday();
        break;
      default:
        break;
    }
  }

  function handleMainChange(event) {
    const target = event.target;

    if (target.id === 'import-file') {
      const fileName = document.getElementById('import-filename');
      if (fileName) {
        fileName.textContent = target.files && target.files[0] ? target.files[0].name : 'Belum ada file';
      }
      return;
    }

    if (target.matches('[data-action="toggle-set"]')) {
      handleToggleSet(target, Number(target.dataset.item), Number(target.dataset.set));
      return;
    }

    if (target.matches('[data-action="variant"]')) {
      changeVariant(Number(target.dataset.item), target.value);
      return;
    }

    if (target.matches('[data-action="rest-seconds"]')) {
      handleRestSecondsSelect(target);
      return;
    }

    if (target.matches('[data-action="settings-rest"]')) {
      handleSettingsRestInput(target);
      return;
    }

    if (target.matches('[data-action="select-exercise"]')) {
      state.selectedExercise = target.value;
      render();
    }
  }

  function handleMainInput(event) {
    const target = event.target;

    if (target.matches('[data-action="set-actual"]')) {
      handleSetActual(target, Number(target.dataset.item), Number(target.dataset.set));
      return;
    }

    if (target.matches('[data-action="set-descent"]')) {
      handleSetDescent(target, Number(target.dataset.item), Number(target.dataset.set));
      return;
    }

    if (target.matches('[data-action="exercise-note"]')) {
      const active = state.activeSession;
      const index = Number(target.dataset.item);
      if (!active || !active.items[index]) return;
      active.items[index].exercise.note = target.value;
    }
  }

  function handleMainSubmit(event) {
    const form = event.target.closest('form[data-form="jogging"]');
    if (!form) return;
    event.preventDefault();
    handleJoggingSubmit(form);
  }

  function init() {
    loadData();
    setRestTimer(getRestSeconds());

    const main = document.getElementById('app-main');
    const nav = document.getElementById('bottom-nav');

    if (main) {
      main.addEventListener('click', handleMainClick);
      main.addEventListener('change', handleMainChange);
      main.addEventListener('input', handleMainInput);
      main.addEventListener('submit', handleMainSubmit);
    }

    if (nav) {
      nav.addEventListener('click', function (event) {
        const button = event.target.closest('.nav-btn');
        if (!button) return;
        navigate(button.dataset.view);
      });
    }

    render();
  }

  init();
})();
