'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#7986cb', // J - indigo
  '#ffb74d', // L - orange
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const comboEl = document.getElementById('combo');

const gameoverExtra = document.getElementById('overlay-gameover-extra');
const saveRow = document.getElementById('overlay-save');
const nameInput = document.getElementById('name-input');
const saveScoreBtn = document.getElementById('save-score-btn');
const overlayHsBody = document.getElementById('overlay-hs-body');
const overlayBestCombo = document.getElementById('overlay-best-combo');
const overlayMaxLines = document.getElementById('overlay-max-lines');
const overlayResetBtn = document.getElementById('overlay-reset-records-btn');

const startScreen = document.getElementById('start-screen');
const startHsBody = document.getElementById('start-hs-body');
const startBestCombo = document.getElementById('start-best-combo');
const startMaxLines = document.getElementById('start-max-lines');
const playBtn = document.getElementById('play-btn');
const resetRecordsBtn = document.getElementById('reset-records-btn');

const HS_KEY = 'tetris.highscores';
const BEST_COMBO_KEY = 'tetris.bestCombo';
const MAX_LINES_KEY = 'tetris.maxLines';
const MAX_HS = 5;

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let combo, bestComboThisGame, started = false;

// ---- localStorage: tabla de records ----
function loadHighscores() {
  try {
    const raw = localStorage.getItem(HS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter(r => r && typeof r.score === 'number')
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_HS);
  } catch (e) {
    return [];
  }
}

function saveHighscores(list) {
  try {
    localStorage.setItem(HS_KEY, JSON.stringify(list.slice(0, MAX_HS)));
  } catch (e) { /* almacenamiento no disponible */ }
}

function loadNum(key) {
  try {
    const v = parseInt(localStorage.getItem(key), 10);
    return Number.isFinite(v) && v > 0 ? v : 0;
  } catch (e) {
    return 0;
  }
}

function saveNum(key, val) {
  try {
    localStorage.setItem(key, String(val));
  } catch (e) { /* almacenamiento no disponible */ }
}

function resetRecords() {
  try {
    localStorage.removeItem(HS_KEY);
    localStorage.removeItem(BEST_COMBO_KEY);
    localStorage.removeItem(MAX_LINES_KEY);
  } catch (e) { /* almacenamiento no disponible */ }
}

function qualifiesTop(sc, list) {
  if (sc <= 0) return false;
  if (list.length < MAX_HS) return true;
  return sc > list[list.length - 1].score;
}

function renderRecords(tbody, comboOut, linesOut, highlightIndex) {
  const list = loadHighscores();
  tbody.textContent = '';
  for (let i = 0; i < MAX_HS; i++) {
    const rec = list[i];
    const tr = document.createElement('tr');
    if (i === highlightIndex) tr.classList.add('hs-highlight');
    const vals = rec
      ? [String(i + 1), rec.name || 'Anónimo', (rec.score || 0).toLocaleString(),
         String(rec.lines ?? 0), 'x' + (rec.combo ?? 0)]
      : [String(i + 1), '—', '—', '—', '—'];
    for (const v of vals) {
      const td = document.createElement('td');
      td.textContent = v;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  comboOut.textContent = 'x' + loadNum(BEST_COMBO_KEY);
  linesOut.textContent = String(loadNum(MAX_LINES_KEY));
}

function showStartScreen() {
  renderRecords(startHsBody, startBestCombo, startMaxLines, -1);
  startScreen.classList.remove('hidden');
}

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    combo++;
    bestComboThisGame = Math.max(bestComboThisGame, combo);
    updateHUD();
  } else {
    combo = 0;
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
  comboEl.textContent = combo;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = '#22222e';
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;

  // Agregados históricos
  if (lines > loadNum(MAX_LINES_KEY)) saveNum(MAX_LINES_KEY, lines);
  if (bestComboThisGame > loadNum(BEST_COMBO_KEY)) saveNum(BEST_COMBO_KEY, bestComboThisGame);

  const eligible = qualifiesTop(score, loadHighscores());
  saveScoreBtn.disabled = false;
  nameInput.value = '';
  saveRow.classList.toggle('hidden', !eligible);
  gameoverExtra.classList.remove('hidden');
  renderRecords(overlayHsBody, overlayBestCombo, overlayMaxLines, -1);
  overlay.classList.remove('hidden');
}

function handleSaveScore() {
  let name = (nameInput.value || '').trim().slice(0, 12);
  if (!name) name = 'Anónimo';
  const record = { name, score, lines, combo: bestComboThisGame, date: new Date().toISOString() };
  const list = loadHighscores();
  list.push(record);
  list.sort((a, b) => b.score - a.score);
  const trimmed = list.slice(0, MAX_HS);
  saveHighscores(trimmed);
  saveScoreBtn.disabled = true;
  renderRecords(overlayHsBody, overlayBestCombo, overlayMaxLines, trimmed.indexOf(record));
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    gameoverExtra.classList.add('hidden');
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  started = true;
  combo = 0;
  bestComboThisGame = 0;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  startScreen.classList.add('hidden');
  gameoverExtra.classList.add('hidden');
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (!started) return;
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);
playBtn.addEventListener('click', init);
saveScoreBtn.addEventListener('click', handleSaveScore);

resetRecordsBtn.addEventListener('click', () => {
  resetRecords();
  renderRecords(startHsBody, startBestCombo, startMaxLines, -1);
});

overlayResetBtn.addEventListener('click', () => {
  resetRecords();
  const eligible = qualifiesTop(score, loadHighscores());
  saveScoreBtn.disabled = !eligible;
  saveRow.classList.toggle('hidden', !eligible);
  renderRecords(overlayHsBody, overlayBestCombo, overlayMaxLines, -1);
});

showStartScreen();
