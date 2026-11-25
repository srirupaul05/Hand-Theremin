import { ThereminAudio, INSTRUMENTS } from "./audio.js";
import { startTracking, pinchAmount, fingerStates } from "./tracking.js";
import { VIBES } from "./vibes.js";

const FINGERS = ["Thumb", "Index", "Middle", "Ring", "Pinky"];
const TIPS = [4, 8, 12, 16, 20]; // fingertip landmark for each finger
const STORAGE_KEY = "hand-theremin-assign-"; // plus the vibe name
const VIBE_KEY = "hand-theremin-vibe";

const MAX_FREQ = 500; // Hz at full pinch spread
const TRAIL_MS = 600; // how long the ribbon behind your fingers lasts
const HOLD_FRAMES = 3; // a finger must stay in its new state this many frames to count (stops flicker)

const $ = (id) => document.getElementById(id);
const view = $("view");
const vctx = view.getContext("2d");
const waveCanvas = $("wave");
const wctx = waveCanvas.getContext("2d");
const video = document.createElement("video");
video.playsInline = true;

const statusEl = $("status");
const freqEl = $("freq");
const fillEl = $("pitchFill");
const rightState = $("rightState");
const leftState = $("leftState");
const startBtn = $("start");
const rootStyle = document.documentElement.style;

let COLOR_LEFT = "#3cf2b0"; // these three change with the vibe
let TINT = "60, 18, 80";
let hueBase = 335,
  hueSpan = 50;

// Only touch the page when something actually changed.
function setText(el, text) {
  if (el._text !== text) {
    el._text = text;
    el.textContent = text;
  }
}

// The right-hand colour slides from pink (low) through red to orange (high) as the pitch rises.
let currentHue = 335;
function hueFor(norm) {
  return Math.round((((hueBase + norm * hueSpan) % 360) + 360) % 360);
}
function colorFor(hue) {
  return "hsl(" + hue + ", 100%, 62%)";
}
let currentColor = colorFor(currentHue);

const audio = new ThereminAudio();

// ---- Which instrument is on which finger (saved in the browser, separately for each vibe) ----
let vibeKey = "neon";
function loadAssignment(key) {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY + key));
    const valid = new Set(INSTRUMENTS.map((i) => i.id));
    if (
      Array.isArray(saved) &&
      saved.length === 5 &&
      saved.every((id) => valid.has(id))
    )
      return saved;
  } catch (err) {
    /* ignore and use the vibe's defaults */
  }
  return VIBES[key].assign.slice();
}
function saveAssignment() {
  try {
    localStorage.setItem(STORAGE_KEY + vibeKey, JSON.stringify(assign));
  } catch (err) {
    /* ignore */
  }
}

const assign = []; // filled in by applyVibe
const fingerOn = [false, false, false, false, false]; // debounced "finger is up" state
const pending = [0, 0, 0, 0, 0];
let active = new Set(); // instruments currently playing

function rebuildActive() {
  active = new Set();
  fingerOn.forEach((on, i) => {
    if (on) active.add(assign[i]);
  });
}

// One row per finger: a light, the finger name, and an instrument picker
const rows = FINGERS.map((name, i) => {
  const li = document.createElement("li");
  li.className = "finger";

  const dot = document.createElement("span");
  dot.className = "dot";

  const label = document.createElement("span");
  label.className = "fname";
  label.textContent = name;

  const select = document.createElement("select");
  select.setAttribute("aria-label", name + " finger instrument");
  for (const ins of INSTRUMENTS) {
    const opt = document.createElement("option");
    opt.value = ins.id;
    opt.textContent = ins.name;
    select.appendChild(opt);
  }
  select.addEventListener("change", () => {
    assign[i] = select.value;
    saveAssignment();
    rebuildActive();
  });

  li.append(dot, label, select);
  $("fingers").appendChild(li);
  return li;
});

let smoothFreq = 0;
let lastFill = -1;
const trail = [];

// Glow without blur: a wide faint stroke under a thin bright one.
function glowStroke(colour, width) {
  vctx.strokeStyle = colour;
  vctx.globalAlpha = 0.22;
  vctx.lineWidth = width * 3.2;
  vctx.stroke();
  vctx.globalAlpha = 1;
  vctx.lineWidth = width;
  vctx.stroke();
}

function drawHand(lm, colour, w, h, k) {
  vctx.save();
  vctx.lineCap = "round";
  vctx.lineJoin = "round";

  vctx.beginPath();
  for (const [a, b] of HAND_CONNECTIONS) {
    vctx.moveTo(lm[a].x * w, lm[a].y * h);
    vctx.lineTo(lm[b].x * w, lm[b].y * h);
  }
  glowStroke(colour, 2.5 * k);

  vctx.fillStyle = "#ffffff";
  vctx.beginPath();
  const r = 3.5 * k;
  for (const p of lm) {
    const x = p.x * w,
      y = p.y * h;
    vctx.moveTo(x + r, y);
    vctx.arc(x, y, r, 0, Math.PI * 2);
  }
  vctx.fill();
  vctx.restore();
}

function onResults(results) {
  const img = results.image;
  if (view.width !== img.width || view.height !== img.height) {
    view.width = img.width;
    view.height = img.height;
  }
  const w = view.width,
    h = view.height,
    aspect = w / h;
  const k = w / 960; // line widths scale with the camera image size

  // Camera image with one plum tint on top
  vctx.drawImage(img, 0, 0, w, h);
  vctx.fillStyle = "rgba(" + TINT + ", 0.55)";
  vctx.fillRect(0, 0, w, h);

  let right = null,
    left = null;
  const found = results.multiHandLandmarks || [];
  for (let i = 0; i < found.length; i++) {
    const label = results.multiHandedness[i].label; // as seen by the person (selfie mode)
    if (label === "Right") right = found[i];
    else left = found[i];
  }

  // ---- Left hand: which fingers are up ----
  const raw = left
    ? fingerStates(left, aspect)
    : [false, false, false, false, false];
  let changed = false;
  for (let i = 0; i < 5; i++) {
    if (raw[i] !== fingerOn[i]) {
      pending[i]++;
      if (pending[i] >= HOLD_FRAMES) {
        fingerOn[i] = raw[i];
        pending[i] = 0;
        changed = true;
        rows[i].classList.toggle("on", raw[i]);
      }
    } else {
      pending[i] = 0;
    }
  }
  if (changed) rebuildActive();

  // ---- Right hand: pinch sets the frequency ----
  let norm = 0;
  if (right) {
    norm = pinchAmount(right, aspect);
    const hue = hueFor(norm);
    if (hue !== currentHue) {
      currentHue = hue;
      currentColor = colorFor(hue);
      rootStyle.setProperty("--pitch", currentColor);
    }
  }

  // ---- Drawing ----
  if (left) {
    drawHand(left, COLOR_LEFT, w, h, k);
    // ring around every raised fingertip
    vctx.save();
    vctx.strokeStyle = COLOR_LEFT;
    vctx.lineWidth = 2.5 * k;
    vctx.beginPath();
    for (let i = 0; i < 5; i++) {
      if (!fingerOn[i]) continue;
      const x = left[TIPS[i]].x * w,
        y = left[TIPS[i]].y * h;
      vctx.moveTo(x + 11 * k, y);
      vctx.arc(x, y, 11 * k, 0, Math.PI * 2);
    }
    vctx.stroke();
    vctx.restore();
  }
  if (right) drawHand(right, currentColor, w, h, k);

  // Pinch ring and ribbon trail for the right hand
  const now = performance.now();
  while (trail.length && now - trail[0].t > TRAIL_MS) trail.shift();
  if (right) {
    const ax = right[4].x * w,
      ay = right[4].y * h;
    const bx = right[8].x * w,
      by = right[8].y * h;
    const mx = (ax + bx) / 2,
      my = (ay + by) / 2;
    trail.push({ x: mx, y: my, t: now, c: currentColor });

    vctx.save();
    vctx.beginPath();
    vctx.arc(
      mx,
      my,
      Math.max(Math.hypot(ax - bx, ay - by) / 2, 5 * k),
      0,
      Math.PI * 2,
    );
    vctx.fillStyle = currentColor;
    vctx.globalAlpha = 0.16;
    vctx.fill();
    glowStroke(currentColor, 3 * k);
    vctx.restore();
  }
  if (trail.length > 1) {
    vctx.save();
    vctx.lineCap = "round";
    for (let i = 1; i < trail.length; i++) {
      const life = 1 - (now - trail[i].t) / TRAIL_MS;
      vctx.globalAlpha = Math.max(life, 0);
      vctx.strokeStyle = trail[i].c;
      vctx.lineWidth = (2 + life * 7) * k;
      vctx.beginPath();
      vctx.moveTo(trail[i - 1].x, trail[i - 1].y);
      vctx.lineTo(trail[i].x, trail[i].y);
      vctx.stroke();
    }
    vctx.restore();
  }

  // ---- Sound ----
  smoothFreq += (norm * MAX_FREQ - smoothFreq) * 0.35;
  audio.update(active, right ? smoothFreq : 0, Boolean(right));
  audio.setSpace(right ? 1 - right[9].y : 0); // higher right hand = more reverb

  // ---- Readouts (each only changes the page when its value changes) ----
  const shownFreq = right ? smoothFreq : 0;
  setText(freqEl, String(Math.round(shownFreq)));
  const fill = Math.round((shownFreq / MAX_FREQ) * 200) / 200; // steps of 0.5%
  if (fill !== lastFill) {
    lastFill = fill;
    fillEl.style.transform = "scaleX(" + fill + ")";
  }

  const upCount = fingerOn.filter(Boolean).length;
  setText(
    rightState,
    right ? "Right hand tracking" : "Right hand not detected",
  );
  setText(
    leftState,
    left
      ? "Left hand tracking, " +
          upCount +
          (upCount === 1 ? " finger up" : " fingers up")
      : "Left hand not detected",
  );
  setText(
    statusEl,
    left && right ? "Both hands tracked" : "Show both hands to the camera",
  );
}

// Sound line across the view. Sized once (and on resize), not on every frame.
let waveW = 0,
  waveH = 0;
function sizeWave() {
  waveW = waveCanvas.clientWidth;
  waveH = waveCanvas.clientHeight;
  waveCanvas.width = waveW;
  waveCanvas.height = waveH;
}
window.addEventListener("resize", sizeWave);

function drawWave() {
  wctx.clearRect(0, 0, waveW, waveH);
  const data = audio.getWaveform();
  if (data) {
    let peak = 0;
    for (let i = 0; i < data.length; i++) {
      const a = Math.abs(data[i]);
      if (a > peak) peak = a;
    }
    if (peak > 0.01) {
      const scale = (waveH * 0.3) / peak; // steady size however many instruments are playing
      wctx.lineJoin = "round";
      wctx.beginPath();
      for (let i = 0; i < data.length; i += 2) {
        const x = (i / (data.length - 1)) * waveW;
        const y = waveH / 2 - data[i] * scale;
        if (i === 0) wctx.moveTo(x, y);
        else wctx.lineTo(x, y);
      }
      wctx.strokeStyle = currentColor;
      wctx.globalAlpha = 0.25;
      wctx.lineWidth = 9;
      wctx.stroke();
      wctx.globalAlpha = 0.95;
      wctx.lineWidth = 2.5;
      wctx.stroke();
    } else {
      wctx.fillStyle = currentColor;
      wctx.globalAlpha = 0.6;
      wctx.fillRect(0, waveH / 2 - 1, waveW, 2);
      wctx.globalAlpha = 1;
    }
  }
  requestAnimationFrame(drawWave);
}

$("volume").addEventListener("input", (e) => {
  audio.setVolume(Number(e.target.value) / 100);
});

$("scale").addEventListener("change", (e) => audio.setScale(e.target.value));
$("root").addEventListener("change", (e) =>
  audio.setRoot(Number(e.target.value)),
);

// ---- Vibes: colours, tempo, scale, drum kit, reverb and default instruments ----
function applyVibe(key) {
  const vibe = VIBES[key];
  if (!vibe) return;
  vibeKey = key;
  try {
    localStorage.setItem(VIBE_KEY, key);
  } catch (err) {
    /* ignore */
  }

  for (const [name, value] of Object.entries(vibe.colors))
    rootStyle.setProperty("--" + name, value);
  COLOR_LEFT = vibe.colors.left;
  TINT = vibe.tint;
  hueBase = vibe.hue[0];
  hueSpan = vibe.hue[1];
  currentHue = hueFor(0);
  currentColor = colorFor(currentHue);
  rootStyle.setProperty("--pitch", currentColor);

  assign.splice(0, 5, ...loadAssignment(key));
  rows.forEach((li, i) => {
    li.querySelector("select").value = assign[i];
  });
  rebuildActive();

  $("vibe").value = key;
  $("scale").value = vibe.scale;
  $("root").value = String(vibe.root);
  audio.setScale(vibe.scale);
  audio.setRoot(vibe.root);
  audio.setVibe(vibe);
}
$("vibe").addEventListener("change", (e) => applyVibe(e.target.value));

let savedVibe = "neon";
try {
  savedVibe = localStorage.getItem(VIBE_KEY) || "neon";
} catch (err) {
  /* ignore */
}
applyVibe(VIBES[savedVibe] ? savedVibe : "neon");

// Record what you play and save it as an audio file
const recBtn = $("record");
let recording = false;
recBtn.addEventListener("click", async () => {
  if (!audio.started) return;
  if (!recording) {
    audio.startRecording();
    recording = true;
    recBtn.textContent = "Stop and save";
    recBtn.classList.add("on");
    return;
  }
  recording = false;
  recBtn.textContent = "Record";
  recBtn.classList.remove("on");
  const blob = await audio.stopRecording();
  if (!blob) return;
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download =
    "hand-theremin." + (blob.type.includes("mp4") ? "m4a" : "webm");
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 5000);
});

startBtn.addEventListener("click", async () => {
  startBtn.disabled = true;
  setText(statusEl, "Starting audio and loading the hand model...");
  try {
    await audio.start();
    await startTracking(video, onResults);
    startBtn.hidden = true;
    recBtn.disabled = false;
    sizeWave();
    requestAnimationFrame(drawWave);
  } catch (err) {
    startBtn.disabled = false;
    setText(statusEl, "Could not start: " + err.message);
    console.error(err);
  }
});
