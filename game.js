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

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;

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
}

/* ---- Temas visuales / skins ---- */

function drawGridLines(context, stroke) {
  context.strokeStyle = stroke;
  context.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    context.beginPath();
    context.moveTo(c * BLOCK, 0);
    context.lineTo(c * BLOCK, ROWS * BLOCK);
    context.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    context.beginPath();
    context.moveTo(0, r * BLOCK);
    context.lineTo(COLS * BLOCK, r * BLOCK);
    context.stroke();
  }
}

// Cada skin expone `paintBlock(context, x, y, colorIndex, size)` para pintar UNA
// celda. El guard de celda vacía y el manejo de `globalAlpha` (ghost = 0.2) los
// centraliza el wrapper `drawBlock`, así que los skins nunca tocan globalAlpha.
const SKINS = {
  retro: {
    label: 'Retro',
    background: '#1a1a25',
    colors: COLORS,
    paintBlock(context, x, y, colorIndex, size) {
      context.fillStyle = this.colors[colorIndex];
      context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
      // highlight
      context.fillStyle = 'rgba(255,255,255,0.12)';
      context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
    },
    drawGrid(context) {
      drawGridLines(context, '#22222e');
    },
  },

  neon: {
    label: 'Neon',
    background: '#000000',
    colors: [
      null,
      '#00eaff', // I
      '#fff200', // O
      '#ff4dff', // T
      '#4dff8f', // S
      '#ff2d55', // Z
      '#4d7bff', // J
      '#ff9d2c', // L
    ],
    paintBlock(context, x, y, colorIndex, size) {
      const color = this.colors[colorIndex];
      context.shadowBlur = size * 0.45;
      context.shadowColor = color;
      context.fillStyle = color;
      context.fillRect(x * size + 2, y * size + 2, size - 4, size - 4);
      // reset shadow para no afectar la rejilla ni otros dibujos
      context.shadowBlur = 0;
      context.shadowColor = 'transparent';
      context.fillStyle = 'rgba(255,255,255,0.28)';
      context.fillRect(x * size + 2, y * size + 2, size - 4, 3);
    },
    drawGrid(context) {
      drawGridLines(context, 'rgba(0,234,255,0.10)');
    },
  },

  pastel: {
    label: 'Pastel',
    background: '#2c2c3a',
    colors: [
      null,
      '#a0e7e5', // I
      '#fdfd96', // O
      '#d9b8ff', // T
      '#b4f8c8', // S
      '#ffb3ba', // Z
      '#a2d2ff', // J
      '#ffd8a8', // L
    ],
    paintBlock(context, x, y, colorIndex, size) {
      const color = this.colors[colorIndex];
      const px = x * size + 1;
      const py = y * size + 1;
      const s = size - 2;
      const rad = Math.min(8, s / 3);
      context.beginPath();
      if (typeof context.roundRect === 'function') {
        context.roundRect(px, py, s, s, rad);
      } else {
        context.moveTo(px + rad, py);
        context.arcTo(px + s, py, px + s, py + s, rad);
        context.arcTo(px + s, py + s, px, py + s, rad);
        context.arcTo(px, py + s, px, py, rad);
        context.arcTo(px, py, px + s, py, rad);
        context.closePath();
      }
      context.fillStyle = color;
      context.fill();
      // soft top highlight
      context.fillStyle = 'rgba(255,255,255,0.20)';
      context.beginPath();
      context.arc(px + s * 0.32, py + s * 0.32, s * 0.16, 0, Math.PI * 2);
      context.fill();
    },
    drawGrid(context) {
      drawGridLines(context, 'rgba(255,255,255,0.05)');
    },
  },

  pixel: {
    label: 'Pixel art',
    background: '#1a1a25',
    colors: COLORS,
    paintBlock(context, x, y, colorIndex, size) {
      const color = this.colors[colorIndex];
      const px = x * size + 1;
      const py = y * size + 1;
      const s = size - 2;
      context.fillStyle = color;
      context.fillRect(px, py, s, s);
      // pixel texture: checkerboard of lighter / darker sub-cells
      const n = 4;
      const cell = s / n;
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          context.fillStyle = (i + j) % 2 === 0
            ? 'rgba(255,255,255,0.16)'
            : 'rgba(0,0,0,0.20)';
          context.fillRect(px + i * cell, py + j * cell, cell, cell);
        }
      }
      // darker frame for a chunky pixel look
      context.strokeStyle = 'rgba(0,0,0,0.35)';
      context.lineWidth = 1;
      context.strokeRect(px + 0.5, py + 0.5, s - 1, s - 1);
    },
    drawGrid(context) {
      drawGridLines(context, '#22222e');
    },
  },
};

const SKIN_KEY = 'tetris.skin';

function loadSkin() {
  try {
    const saved = localStorage.getItem(SKIN_KEY);
    if (saved && SKINS[saved]) return saved;
  } catch (e) { /* localStorage no disponible */ }
  return 'retro';
}

let currentSkin = loadSkin();

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  context.globalAlpha = alpha ?? 1;
  SKINS[currentSkin].paintBlock(context, x, y, colorIndex, size);
  context.globalAlpha = 1;
}

function drawGrid() {
  const skin = SKINS[currentSkin];
  (skin.drawGrid || SKINS.retro.drawGrid).call(skin, ctx);
}

function applySkin(name) {
  if (!SKINS[name]) name = 'retro';
  currentSkin = name;
  try { localStorage.setItem(SKIN_KEY, name); } catch (e) { /* ignore */ }
  const bg = SKINS[name].background;
  canvas.style.background = bg;
  nextCanvas.style.background = bg;
  if (board && current) draw();
  if (next) drawNext();
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
  overlay.classList.remove('hidden');
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
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
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

const skinSelect = document.getElementById('skin-select');
if (skinSelect) {
  skinSelect.value = currentSkin;
  skinSelect.addEventListener('change', e => {
    applySkin(e.target.value);
    // soltar el foco: si no, Flechas/Espacio navegan el <select> y disparan
    // 'change' en cada caída, cambiando de skin sin querer durante la partida.
    e.target.blur();
  });
}

applySkin(currentSkin);
init();
