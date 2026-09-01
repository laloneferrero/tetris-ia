# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Vanilla JavaScript Tetris rendered on HTML5 Canvas. No build system, no dependencies, no `package.json`. Three source files: `index.html`, `style.css`, `game.js`.

## Running

Open `index.html` directly (`open index.html`) — works because `game.js` is a plain `<script>` (no ES modules, no `fetch`), so `file://` is fine. Or serve statically (`python3 -m http.server 8000`). No compile step. Refresh the browser to pick up edits.

There is no test suite, linter, or formatter configured. CI: `.github/workflows/claude.yml` (PR assistant) and `claude-code-review.yml` (auto review on PRs) — no app build/test.

## Architecture

All game logic lives in `game.js` as module-level functions sharing mutable module-level state (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, timing accumulators). `init()` resets all of it and is also the restart handler.

Key concepts:

- **Board model**: `ROWS × COLS` array of ints. `0` = empty; `1..7` = color index into `COLORS`, matching the piece type in `PIECES`.
- **Pieces**: square matrices in `PIECES` (index 1..7). Rotation = transpose + row reverse (`rotateCW`), producing a new matrix each call. `randomPiece()` deep-copies the template.
- **Collision** (`collide(shape, x, y)`): single gate for all movement/rotation/lock decisions — bounds check plus overlap with settled cells. Callers test a candidate position before committing.
- **Wall kicks** (`tryRotate`): rotate, then try x-offsets `[0, -1, 1, -2, 2]`; first non-colliding wins, else rotation is dropped.
- **Game loop** (`loop`): `requestAnimationFrame`, accumulates `dt` into `dropAccum`; when `>= dropInterval`, drop one row or `lockPiece()`. `loop` also does all drawing every frame. This gravity drop is inlined separately from `softDrop()` — both paths converge on `lockPiece()`, so drop-behavior edits must touch both.
- **Lock sequence**: `lockPiece()` → `merge()` (stamp piece into board) → `clearLines()` → `spawn()`. `spawn()` promotes `next` to `current`, rolls a new `next`, and calls `endGame()` if the fresh piece already collides.
- **Scoring / speed**: `LINE_SCORES` table × `level`; soft drop +1/row, hard drop +2/cell. Level = `floor(lines / 10) + 1`. `dropInterval = max(100, 1000 - (level - 1) * 90)` ms, recomputed in `clearLines()`.
- **Ghost piece** (`ghostY`): projects `current` straight down; drawn at `alpha 0.2` before the real piece.
- **Rendering**: `draw()` clears, then grid → settled board → ghost → current piece, all via `drawBlock`. Next-piece preview is a separate `nextCanvas` / `drawNext()`, redrawn only on spawn.
- **Input**: one `keydown` listener. `P` toggles pause always; other keys are ignored while paused or game over. Horizontal moves are inlined; drops/rotation delegate to helpers. `ArrowUp` and `KeyX` both rotate CW. `Space` calls `e.preventDefault()` (suppress page scroll). `updateHUD()` runs at the end of every keydown, plus inside `softDrop`/`clearLines`; `hardDrop` relies on that trailing call. `restartBtn` click → `init()`; `init()` also runs once at load and is the sole reset path.
- **Overlay**: single `#overlay` element reused for both PAUSA and GAME OVER, toggled via the `hidden` class.

## Editing constraints

- `COLS`, `ROWS`, `BLOCK` in `game.js` must stay in sync with `<canvas id="board">` `width`/`height` in `index.html` (`COLS*BLOCK` × `ROWS*BLOCK`).
- `COLORS` and `PIECES` are parallel arrays indexed 1..7; keep them aligned.
- `page lang` and all user-facing strings are Spanish.
