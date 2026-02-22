const storageKey = 'focusmode_data_v2';

const defaultState = {
  settings: { pomodoroMinutes: 25, countdownMinutes: 15 },
  timerMode: 'pomodoro',
  history: [],
  breaks: [],
  todos: [],
  todoistToken: '',
  music: [],
};

const state = loadState();
const runtime = { currentTrackId: null };

const ui = {
  menuBtns: [...document.querySelectorAll('.menu-btn')],
  panels: {
    timer: document.getElementById('timer-panel'),
    analysis: document.getElementById('analysis-panel'),
    todo: document.getElementById('todo-panel'),
  },
  modeBtns: [...document.querySelectorAll('.mode-btn')],
  modeLabel: document.getElementById('modeLabel'),
  timerDisplay: document.getElementById('timerDisplay'),
  startPauseBtn: document.getElementById('startPauseBtn'),
  resetBtn: document.getElementById('resetBtn'),
  completeBreakBtn: document.getElementById('completeBreakBtn'),
  openSettings: document.getElementById('openSettings'),
  settingsDialog: document.getElementById('settingsDialog'),
  pomodoroMinutes: document.getElementById('pomodoroMinutes'),
  countdownMinutes: document.getElementById('countdownMinutes'),
  saveSettingsBtn: document.getElementById('saveSettingsBtn'),
  focusSessions: document.getElementById('focusSessions'),
  focusMinutes: document.getElementById('focusMinutes'),
  streakCount: document.getElementById('streakCount'),
  avgBreak: document.getElementById('avgBreak'),
  avgFocus: document.getElementById('avgFocus'),
  focusTrend: document.getElementById('focusTrend'),
  nextTarget: document.getElementById('nextTarget'),
  weeklyBars: document.getElementById('weeklyBars'),
  todoForm: document.getElementById('todoForm'),
  todoInput: document.getElementById('todoInput'),
  todoList: document.getElementById('todoList'),
  todoistToken: document.getElementById('todoistToken'),
  saveTokenBtn: document.getElementById('saveTokenBtn'),
  syncTodoistBtn: document.getElementById('syncTodoistBtn'),
  todoistStatus: document.getElementById('todoistStatus'),
  musicUploader: document.getElementById('musicUploader'),
  volumeSlider: document.getElementById('volumeSlider'),
  musicList: document.getElementById('musicList'),
  audioPlayer: document.getElementById('audioPlayer'),
  nowPlaying: document.getElementById('nowPlaying'),
};

let timerSeconds = state.settings[`${state.timerMode}Minutes`] * 60;
let timerInterval = null;
let running = false;

init();

function init() {
  bindPanelNavigation();
  bindTimerControls();
  bindSettings();
  bindTodo();
  bindMusic();
  hydrateUI();
}

function loadState() {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return structuredClone(defaultState);
    return { ...structuredClone(defaultState), ...JSON.parse(raw) };
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

function bindPanelNavigation() {
  ui.menuBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      ui.menuBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const panel = btn.dataset.panel;
      Object.entries(ui.panels).forEach(([name, node]) => node.classList.toggle('active', name === panel));
      if (panel === 'analysis') renderAnalysis();
    });
  });
}

function bindTimerControls() {
  ui.modeBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      ui.modeBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.timerMode = btn.dataset.mode;
      timerSeconds = state.settings[`${state.timerMode}Minutes`] * 60;
      running = false;
      clearInterval(timerInterval);
      ui.startPauseBtn.textContent = 'Start';
      updateTimerDisplay();
      updateModeLabel();
      saveState();
    });
  });

  ui.startPauseBtn.addEventListener('click', () => {
    running = !running;
    ui.startPauseBtn.textContent = running ? 'Pause' : 'Start';
    if (running) {
      timerInterval = setInterval(() => {
        timerSeconds -= 1;
        updateTimerDisplay();
        if (timerSeconds <= 0) {
          clearInterval(timerInterval);
          running = false;
          ui.startPauseBtn.textContent = 'Start';
          onTimerCompleted();
        }
      }, 1000);
    } else {
      clearInterval(timerInterval);
    }
  });

  ui.resetBtn.addEventListener('click', () => {
    clearInterval(timerInterval);
    running = false;
    ui.startPauseBtn.textContent = 'Start';
    timerSeconds = state.settings[`${state.timerMode}Minutes`] * 60;
    updateTimerDisplay();
  });

  ui.completeBreakBtn.addEventListener('click', () => {
    const mins = Number(prompt('Break length in minutes?', '5'));
    if (!mins || mins < 1) return;
    state.breaks.push({ minutes: mins, date: new Date().toISOString() });
    saveState();
    renderAnalysis();
  });
}

function onTimerCompleted() {
  const completedMinutes = state.settings[`${state.timerMode}Minutes`];
  state.history.push({ minutes: completedMinutes, date: new Date().toISOString(), mode: state.timerMode });
  timerSeconds = completedMinutes * 60;
  updateTimerDisplay();
  saveState();
  renderStats();
  renderAnalysis();
}

function bindSettings() {
  ui.openSettings.addEventListener('click', () => {
    ui.pomodoroMinutes.value = state.settings.pomodoroMinutes;
    ui.countdownMinutes.value = state.settings.countdownMinutes;
    ui.settingsDialog.showModal();
  });

  ui.saveSettingsBtn.addEventListener('click', (e) => {
    e.preventDefault();
    state.settings.pomodoroMinutes = clamp(ui.pomodoroMinutes.value, 1, 180, 25);
    state.settings.countdownMinutes = clamp(ui.countdownMinutes.value, 1, 240, 15);
    timerSeconds = state.settings[`${state.timerMode}Minutes`] * 60;
    updateTimerDisplay();
    saveState();
    ui.settingsDialog.close();
  });
}

function bindTodo() {
  ui.todoForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = ui.todoInput.value.trim();
    if (!text) return;
    state.todos.unshift({ id: crypto.randomUUID(), text, done: false, source: 'local' });
    ui.todoInput.value = '';
    saveState();
    renderTodos();
  });

  ui.saveTokenBtn.addEventListener('click', () => {
    state.todoistToken = ui.todoistToken.value.trim();
    saveState();
    ui.todoistStatus.textContent = state.todoistToken
      ? 'Token saved locally (not committed).'
      : 'Token cleared.';
  });

  ui.syncTodoistBtn.addEventListener('click', syncTodoistTasks);
}

async function syncTodoistTasks() {
  const token = (ui.todoistToken.value || state.todoistToken || '').trim();
  if (!token) {
    ui.todoistStatus.textContent = 'Missing token. Paste it and try again.';
    return;
  }

  ui.todoistStatus.textContent = 'Syncing Todoist tasks...';

  try {
    const res = await fetch('https://api.todoist.com/rest/v2/tasks', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (res.status === 401) {
      ui.todoistStatus.textContent = '401 Unauthorized: token invalid/expired. Regenerate it in Todoist settings.';
      return;
    }
    if (!res.ok) throw new Error(`Todoist error ${res.status}`);

    const tasks = await res.json();
    state.todoistToken = token;
    state.todos = state.todos.filter((task) => task.source !== 'todoist');
    tasks.forEach((task) => {
      state.todos.push({ id: `todoist-${task.id}`, text: task.content, done: false, source: 'todoist' });
    });
    saveState();
    renderTodos();
    ui.todoistStatus.textContent = `Synced ${tasks.length} task(s) from Todoist.`;
  } catch {
    ui.todoistStatus.textContent = 'Sync failed. Check internet access, browser CORS, and token validity.';
  }
}

function bindMusic() {
  ui.volumeSlider.addEventListener('input', () => {
    ui.audioPlayer.volume = Number(ui.volumeSlider.value) / 100;
  });

  ui.audioPlayer.addEventListener('timeupdate', updateNowPlaying);
  ui.audioPlayer.addEventListener('loadedmetadata', syncTrackDuration);

  ui.musicUploader.addEventListener('change', async (event) => {
    const files = [...event.target.files];
    for (const file of files) {
      const data = await fileToDataUrl(file);
      state.music.push({
        id: crypto.randomUUID(),
        name: file.name.replace(/\.[^/.]+$/, ''),
        data,
        duration: 0,
      });
    }

    if (!saveState()) {
      ui.nowPlaying.textContent = 'Large file blocked by localStorage limit. Try shorter/smaller audio files.';
    }

    renderMusic();
    event.target.value = '';
  });
}

function renderMusic() {
  ui.musicList.innerHTML = '';
  state.music.forEach((track) => {
    const li = document.createElement('li');
    li.className = 'music-item';
    li.innerHTML = `
      <input value="${escapeHtml(track.name)}" data-track-id="${track.id}" />
      <span class="meta">${formatTime(track.duration || 0)}</span>
      <button data-play-id="${track.id}">Play</button>
      <button data-del-id="${track.id}">✕</button>
    `;
    ui.musicList.appendChild(li);
  });

  ui.musicList.querySelectorAll('input[data-track-id]').forEach((input) => {
    input.addEventListener('change', () => {
      const track = state.music.find((m) => m.id === input.dataset.trackId);
      if (!track) return;
      track.name = input.value.trim() || track.name;
      saveState();
      updateNowPlaying();
    });
  });

  ui.musicList.querySelectorAll('button[data-play-id]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const track = state.music.find((m) => m.id === btn.dataset.playId);
      if (!track) return;
      runtime.currentTrackId = track.id;
      ui.audioPlayer.src = track.data;
      ui.audioPlayer.load();
      try {
        await ui.audioPlayer.play();
      } catch {
        ui.nowPlaying.textContent = 'Playback blocked by browser. Press play on audio controls once.';
      }
      updateNowPlaying();
    });
  });

  ui.musicList.querySelectorAll('button[data-del-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.music = state.music.filter((m) => m.id !== btn.dataset.delId);
      if (runtime.currentTrackId === btn.dataset.delId) {
        runtime.currentTrackId = null;
        ui.audioPlayer.removeAttribute('src');
        ui.audioPlayer.load();
      }
      saveState();
      renderMusic();
      updateNowPlaying();
    });
  });
}

function syncTrackDuration() {
  const track = state.music.find((m) => m.id === runtime.currentTrackId);
  if (!track) return;
  const duration = Number.isFinite(ui.audioPlayer.duration) ? ui.audioPlayer.duration : 0;
  track.duration = duration;
  saveState();
  renderMusic();
  updateNowPlaying();
}

function updateNowPlaying() {
  const track = state.music.find((m) => m.id === runtime.currentTrackId);
  if (!track) {
    ui.nowPlaying.textContent = 'No track selected';
    return;
  }
  const current = formatTime(ui.audioPlayer.currentTime || 0);
  const total = formatTime(ui.audioPlayer.duration || track.duration || 0);
  ui.nowPlaying.textContent = `Now playing: ${track.name} (${current} / ${total})`;
}

function renderTodos() {
  ui.todoList.innerHTML = '';
  state.todos.forEach((todo) => {
    const li = document.createElement('li');
    li.classList.toggle('done', todo.done);
    li.innerHTML = `<span>${escapeHtml(todo.text)}</span>
      <div>
        <button class="ghost-btn" data-toggle="${todo.id}">✔</button>
        <button class="ghost-btn" data-remove="${todo.id}">✕</button>
      </div>`;
    ui.todoList.appendChild(li);
  });

  ui.todoList.querySelectorAll('[data-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const task = state.todos.find((t) => t.id === btn.dataset.toggle);
      if (!task) return;
      task.done = !task.done;
      saveState();
      renderTodos();
    });
  });

  ui.todoList.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.todos = state.todos.filter((t) => t.id !== btn.dataset.remove);
      saveState();
      renderTodos();
    });
  });
}

function renderStats() {
  const totalSessions = state.history.length;
  const totalMinutes = state.history.reduce((sum, item) => sum + item.minutes, 0);
  ui.focusSessions.textContent = String(totalSessions);
  ui.focusMinutes.textContent = `${totalMinutes} min`;
  ui.streakCount.textContent = `${computeStreak(state.history)} days`;
}

function renderAnalysis() {
  const weekData = getLast7DaysData();
  const totalFocus = weekData.reduce((a, b) => a + b.focus, 0);
  const totalBreak = weekData.reduce((a, b) => a + b.breaks, 0);
  const avgFocus = totalFocus / 7;
  const avgBreak = totalBreak / 7;

  ui.avgFocus.textContent = `${avgFocus.toFixed(1)} min`;
  ui.avgBreak.textContent = `${avgBreak.toFixed(1)} min`;

  const firstHalf = weekData.slice(0, 3).reduce((a, b) => a + b.focus, 0);
  const secondHalf = weekData.slice(4).reduce((a, b) => a + b.focus, 0);
  const trend = secondHalf - firstHalf;
  ui.focusTrend.textContent = trend >= 0 ? `Increasing (+${trend} min)` : `Decreasing (${trend} min)`;

  const target = Math.max(25, Math.round(avgFocus + (trend >= 0 ? 10 : 5)));
  ui.nextTarget.textContent = `${target} minutes`;

  const maxFocus = Math.max(...weekData.map((d) => d.focus), 1);
  ui.weeklyBars.innerHTML = '';
  weekData.forEach((day) => {
    const bar = document.createElement('div');
    bar.className = 'weekly-bar';
    bar.style.height = `${Math.max(8, (day.focus / maxFocus) * 120)}px`;
    bar.title = `${day.label}: ${day.focus} min`;
    bar.innerHTML = `<span>${day.label}</span>`;
    ui.weeklyBars.appendChild(bar);
  });
}

function getLast7DaysData() {
  const result = [];
  for (let i = 6; i >= 0; i -= 1) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const key = date.toISOString().slice(0, 10);
    const focus = state.history.filter((h) => h.date.startsWith(key)).reduce((sum, h) => sum + h.minutes, 0);
    const breaks = state.breaks.filter((b) => b.date.startsWith(key)).reduce((sum, b) => sum + b.minutes, 0);
    result.push({ label: date.toLocaleDateString(undefined, { weekday: 'short' }), focus, breaks });
  }
  return result;
}

function computeStreak(entries) {
  const days = [...new Set(entries.map((e) => e.date.slice(0, 10)))].sort().reverse();
  let streak = 0;
  const now = new Date();
  for (let i = 0; ; i += 1) {
    const check = new Date(now);
    check.setDate(now.getDate() - i);
    const key = check.toISOString().slice(0, 10);
    if (days.includes(key)) streak += 1;
    else break;
  }
  return streak;
}

function hydrateUI() {
  ui.todoistToken.value = state.todoistToken || '';
  ui.modeBtns.forEach((b) => b.classList.toggle('active', b.dataset.mode === state.timerMode));
  ui.audioPlayer.volume = Number(ui.volumeSlider.value) / 100;
  timerSeconds = state.settings[`${state.timerMode}Minutes`] * 60;
  updateModeLabel();
  updateTimerDisplay();
  renderStats();
  renderAnalysis();
  renderTodos();
  renderMusic();
  updateNowPlaying();
}

function updateModeLabel() {
  ui.modeLabel.textContent = state.timerMode === 'pomodoro' ? 'Pomodoro Session' : 'Countdown Session';
}

function updateTimerDisplay() {
  const min = Math.floor(timerSeconds / 60);
  const sec = timerSeconds % 60;
  ui.timerDisplay.textContent = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function clamp(value, min, max, fallback) {
  const num = Number(value);
  if (Number.isNaN(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function formatTime(totalSeconds) {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const min = Math.floor(sec / 60);
  const remain = sec % 60;
  return `${String(min).padStart(2, '0')}:${String(remain).padStart(2, '0')}`;
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
