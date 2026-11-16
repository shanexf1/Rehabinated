// Rehabinated knee tracker: MediaPipe Pose in the phone browser -> live knee flexion
// -> recorded session -> session_input.json for the knee-rom agent skill.
import { FilesetResolver, PoseLandmarker } from
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/vision_bundle.mjs";
import { analyzeFrames, poseToFrame, sideVisibility, kneeFlexionDeg, median, DEFAULTS }
  from "./kneeAngles.js";
import { TESTS, CHAIR, frameFeatures, pickLeg, rotationForHead, unrotateLandmarks,
  drawRotated, countChairStands } from "./movement.js";

const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm";
const MODEL_URLS = {
  lite: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
  full: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task",
};
const APP_VERSION = "0.3.0";
const ROTATION_CYCLE = [90, -90, 0];

const $ = (id) => document.getElementById(id);
const video = $("video"), canvas = $("overlay"), ctx = canvas.getContext("2d");
const ui = {
  status: $("modelStatus"), angle: $("angle"), hint: $("hint"), stage: $("stage"),
  btnCamera: $("btnCamera"), btnRecord: $("btnRecord"), file: $("fileInput"),
  rec: $("recBadge"), recCount: $("recCount"), progress: $("progress"), bar: $("progressBar"),
  side: $("side"), facing: $("facing"), model: $("model"), rate: $("rate"),
  movement: $("movement"), moveTip: $("moveTip"), best: $("best"),
  resMovement: $("resMovement"), countdown: $("countdown"),
};

const state = {
  landmarker: null, modelKind: null, delegate: null, modelSource: null,
  lastTs: 0, stream: null, looping: false, lastVideoTime: -1, wakeLock: null,
  recording: false, recStart: 0, lastRecT: -Infinity,
  rec: null, // { left: [], right: [], feats: [], noPose: 0, width, height, mode, rotations: {} }
  liveThigh: [], liveShank: [],
  featBuf: [], sideVotes: 0,
  rotation: 0, noPoseStreak: 0, rotCanvas: null, liveGood: [], countingDown: false,
  session: null, analysis: null,
};

window.__tracker = state; // debugging / browser tests (no personal data)

// The movement in force: the user's choice, else the auto-detected one (may be null).
function currentMovement() {
  return ui.movement.value;
}

// ---------- model ----------
let filesetPromise = null;
async function loadModel(kind) {
  setStatus("Loading pose model…");
  ui.btnCamera.disabled = true;
  if (state.landmarker) { state.landmarker.close(); state.landmarker = null; }
  filesetPromise ??= FilesetResolver.forVisionTasks(WASM);
  const fileset = await filesetPromise;
  // Prefer a self-hosted copy (models/ folder) where Google storage is unreachable.
  let path = MODEL_URLS[kind];
  try {
    const local = `models/pose_landmarker_${kind}.task`;
    const r = await fetch(local, { method: "HEAD" });
    if (r.ok) path = local;
  } catch { /* use Google-hosted model */ }
  for (const delegate of ["GPU", "CPU"]) {
    try {
      state.landmarker = await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: path, delegate },
        runningMode: "VIDEO", numPoses: 1,
        minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
      });
      Object.assign(state, { modelKind: kind, delegate, modelSource: path });
      setStatus(`Model ready · ${kind} · ${delegate}`, "ok");
      ui.btnCamera.disabled = false;
      return;
    } catch (e) { console.warn(`Pose model failed on ${delegate}`, e); }
  }
  setStatus("Model failed to load", "err");
  ui.hint.textContent = "Could not load the pose model. Check the connection and reload.";
}

function nextTs(proposed) {
  // MediaPipe VIDEO mode needs strictly increasing timestamps across all calls.
  state.lastTs = Math.max(proposed, state.lastTs + 1);
  return state.lastTs;
}

// ---------- camera ----------
async function startCamera() {
  if (state.stream) return stopCamera();
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: ui.facing.value, width: { ideal: 1280 }, height: { ideal: 720 } },
    });
  } catch (e) {
    ui.hint.textContent = "Camera blocked. Allow camera access for this site and try again.";
    console.error(e); return;
  }
  video.removeAttribute("src");
  state.featBuf = []; state.liveGood = []; state.rotationSet = false; state.rotation = 0;
  state.liveSide = null; state.sideVotes = 0;
  renderTest();
  video.srcObject = state.stream;
  await video.play();
  sizeCanvas();
  ui.stage.classList.toggle("mirror", ui.facing.value === "user");
  ui.btnCamera.textContent = "Stop camera";
  ui.btnRecord.disabled = false;
  try { state.wakeLock = await navigator.wakeLock?.request("screen"); } catch { /* optional */ }
  state.looping = true;
  requestAnimationFrame(loop);
}

function stopCamera() {
  if (state.recording) toggleRecord();
  state.looping = false;
  state.stream?.getTracks().forEach((t) => t.stop());
  state.stream = null;
  video.srcObject = null;
  state.wakeLock?.release?.(); state.wakeLock = null;
  ui.btnCamera.textContent = "Start camera";
  ui.btnRecord.disabled = true;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function sizeCanvas() {
  canvas.width = video.videoWidth || 720;
  canvas.height = video.videoHeight || 960;
  ui.stage.style.aspectRatio = `${canvas.width} / ${canvas.height}`;
}

function loop() {
  if (!state.looping || !state.landmarker) return;
  if (video.readyState >= 2 && video.currentTime !== state.lastVideoTime) {
    state.lastVideoTime = video.currentTime;
    if (canvas.width !== video.videoWidth && video.videoWidth) sizeCanvas();
    const now = performance.now();
    handlePose(detect(nextTs(now)), (now - state.recStart) / 1000, true);
  }
  requestAnimationFrame(loop);
}

// Run the pose model on the current video frame. For lying movements the frame is
// rotated 90° so the person appears upright to the model; landmarks are mapped back.
function detect(ts) {
  const W = video.videoWidth, H = video.videoHeight;
  const lying = TESTS[currentMovement()]?.lying;
  if (!lying) state.rotation = 0;
  let source = video;
  if (state.rotation) {
    state.rotCanvas ??= document.createElement("canvas");
    const rc = state.rotCanvas;
    if (rc.width !== H || rc.height !== W) { rc.width = H; rc.height = W; }
    drawRotated(rc.getContext("2d"), video, W, H, state.rotation);
    source = rc;
  }
  const lm = state.landmarker.detectForVideo(source, ts).landmarks?.[0];
  if (lm) {
    state.noPoseStreak = 0;
    if (state.rec) state.rec.rotations[state.rotation] = (state.rec.rotations[state.rotation] || 0) + 1;
    return unrotateLandmarks(lm, state.rotation);
  }
  // Lying and nothing found for a while: try the next orientation.
  if (lying && ++state.noPoseStreak >= 15) {
    state.noPoseStreak = 0;
    state.rotation = ROTATION_CYCLE[(ROTATION_CYCLE.indexOf(state.rotation) + 1) % ROTATION_CYCLE.length];
  }
  return undefined;
}

// ---------- test choice ----------
const TEST_KEY = "kneeTest";
function renderTest() {
  const t = TESTS[currentMovement()];
  ui.moveTip.textContent = t.setup;
  try { localStorage.setItem(TEST_KEY, currentMovement()); } catch { /* optional */ }
}

// ---------- per-frame handling ----------
// Live leg: sticky, so the display doesn't jump between legs. Switch only after the
// other leg has looked better for ~1 s of frames in a row.
function chooseSide(lm) {
  if (ui.side.value !== "auto") return ui.side.value;
  const guess = state.featBuf.length >= 8
    ? pickLeg(state.featBuf.slice(-90), currentMovement()).side
    : (sideVisibility(lm, "right") >= sideVisibility(lm, "left") ? "right" : "left");
  if (!state.liveSide) return guess;
  if (guess === state.liveSide) { state.sideVotes = 0; return state.liveSide; }
  return ++state.sideVotes >= 30 ? (state.sideVotes = 0, guess) : state.liveSide;
}

function handlePose(lm, tSec, live) {
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  if (!lm) {
    ui.angle.textContent = "--";
    setHint(TESTS[currentMovement()]?.lying
      ? "No person detected. Lying down: phone on the floor in landscape, whole body in frame."
      : "No person detected. Fit the whole body in the frame.", true);
    if (state.recording || !live) state.rec.noPose++;
    return;
  }
  const feats = frameFeatures(lm, W, H);
  pushWindow(state.featBuf, feats, 180);
  const mv = currentMovement();
  if (TESTS[mv]?.lying && !state.rotationSet) {
    state.rotation = rotationForHead(feats.headLeft);
    state.rotationSet = true;
  } else if (!TESTS[mv]?.lying) state.rotationSet = false;

  const side = chooseSide(lm);
  if (side !== state.liveSide) { state.liveSide = side; state.liveThigh = []; state.liveShank = []; }
  const f = poseToFrame(lm, side, W, H, tSec);
  const flex = kneeFlexionDeg(f.hip, f.knee, f.ankle);
  const minVis = Math.min(f.hip[2], f.knee[2], f.ankle[2]);
  const thigh = Math.hypot(f.hip[0] - f.knee[0], f.hip[1] - f.knee[1]);
  const shank = Math.hypot(f.ankle[0] - f.knee[0], f.ankle[1] - f.knee[1]);
  let segOff = false;
  if (minVis >= DEFAULTS.visibilityMin) {
    pushWindow(state.liveThigh, thigh); pushWindow(state.liveShank, shank);
    if (state.liveThigh.length >= 8) {
      const dt = thigh / median(state.liveThigh) - 1, ds = shank / median(state.liveShank) - 1;
      segOff = Math.max(Math.abs(dt), Math.abs(ds)) > DEFAULTS.segmentTolerance;
    }
  }
  const ok = minVis >= DEFAULTS.visibilityMin && !segOff;
  drawLeg(f, ok);
  ui.angle.textContent = Number.isFinite(flex) ? `${Math.round(flex)}°` : "--";
  if (minVis < DEFAULTS.visibilityMin) setHint("Hip, knee and ankle must all be clearly visible.", true);
  else if (segOff) setHint("Leg looks rotated: turn side-on to the camera.", true);
  else setHint(`Tracking ${side} leg · ${TESTS[mv].label}` +
               `${state.recording ? " · recording" : ""}`, false);

  // Live result (trusted frames only): whole recording, or the last 10 s.
  if (ok && Number.isFinite(flex)) state.liveGood.push({ t: tSec, flex });
  if (!state.recording) state.liveGood = state.liveGood.filter((g) => g.t > tSec - 10);
  ui.best.textContent = liveSummary(mv, tSec);

  const record = live ? state.recording : true;
  if (!record) return;
  const rate = clampRate();
  if (live && tSec - state.lastRecT < 1 / rate) return;
  state.lastRecT = tSec;
  // Store both legs and body features so the leg and movement can be (re)chosen later.
  state.rec.left.push(poseToFrame(lm, "left", W, H, tSec));
  state.rec.right.push(poseToFrame(lm, "right", W, H, tSec));
  state.rec.feats.push(feats);
  ui.recCount.textContent = String(state.rec.right.length);
}

function liveSummary(mv, tSec) {
  const vals = state.liveGood.map((g) => g.flex);
  if (!vals.length) return "";
  if (TESTS[mv]?.kind === "chair_stand") {
    if (!state.recording) return "Sit down, press Record, and stand up on Go. The app stops after 30 s.";
    const r = countChairStands(state.liveGood, { startT: state.rec?.chairStartT ?? null });
    if (r.t0 == null) return "Timing starts when you first stand up…";
    const left = Math.max(0, CHAIR.windowS - (tSec - r.t0));
    if (tSec - r.t0 >= CHAIR.windowS + 0.5) requestAutoStop();   // keep 0.5 s past the window
    return `Stands: ${r.reps} · ${Math.ceil(left)} s left`;
  }
  const when = state.recording ? "this recording" : "last 10 s";
  return `Best straightening ${Math.round(Math.min(...vals))}° · deepest bend ${Math.round(Math.max(...vals))}° (${when})`;
}

// Stop a live chair stand once, right after the 30 s window ends.
function requestAutoStop() {
  if (state.autoStopping || !state.recording || state.rec?.mode !== "camera") return;
  state.autoStopping = true;
  setTimeout(() => { state.autoStopping = false; if (state.recording) toggleRecord(); }, 0);
}

function pushWindow(arr, v, n = 45) { arr.push(v); if (arr.length > n) arr.shift(); }

function drawLeg(f, ok) {
  const lw = Math.max(3, canvas.width / 160);
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.strokeStyle = ok ? "#3987e5" : "#c98500";
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.moveTo(f.hip[0], f.hip[1]); ctx.lineTo(f.knee[0], f.knee[1]); ctx.lineTo(f.ankle[0], f.ankle[1]);
  ctx.stroke();
  for (const p of [f.hip, f.knee, f.ankle]) {
    ctx.beginPath(); ctx.arc(p[0], p[1], lw * 1.6, 0, 2 * Math.PI);
    ctx.fillStyle = p[2] >= DEFAULTS.visibilityMin ? "#f0efec" : "#e66767";
    ctx.fill(); ctx.lineWidth = lw / 2; ctx.strokeStyle = "#121211"; ctx.stroke();
  }
}

function setHint(text, warn) { ui.hint.textContent = text; ui.hint.classList.toggle("warn", warn); }
function setStatus(text, cls) { ui.status.textContent = text; ui.status.className = `chip ${cls ?? ""}`; }
function clampRate() { return Math.min(30, Math.max(2, Number(ui.rate.value) || 10)); }

// ---------- recording ----------
function newRec(mode) {
  return { left: [], right: [], feats: [], noPose: 0, width: canvas.width, height: canvas.height, mode, rotations: {} };
}

function toggleRecord() {
  if (state.countingDown) return;
  if (!state.recording) {
    // The chair stand is timed: count down, start at "Go", stop after 30 s.
    if (currentMovement() === "chair_stand_30s") return countdownThenRecord();
    startRecording(null);
  } else {
    state.recording = false;
    ui.btnRecord.textContent = "Record"; ui.btnRecord.classList.remove("recording");
    ui.rec.hidden = true;
    finalize();
  }
}

function startRecording(chairStartT) {
  state.rec = newRec("camera");
  state.rec.chairStartT = chairStartT;
  state.recStart = performance.now(); state.lastRecT = -Infinity; state.liveGood = [];
  state.lastFileName = null;
  state.recording = true;
  ui.btnRecord.textContent = "Stop & review"; ui.btnRecord.classList.add("recording");
  ui.rec.hidden = false; ui.recCount.textContent = "0";
  $("results").hidden = true;
}

async function countdownThenRecord() {
  state.countingDown = true;
  ui.btnRecord.disabled = true;
  $("results").hidden = true;
  ui.countdown.hidden = false;
  for (const n of ["3", "2", "1"]) { ui.countdown.textContent = n; await sleep(1000); }
  ui.countdown.textContent = "Go";
  startRecording(0);
  state.countingDown = false;
  ui.btnRecord.disabled = false;
  await sleep(700);
  ui.countdown.hidden = true;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function analyzeFile(file) {
  if (!file || !state.landmarker) return;
  stopCamera();
  ui.stage.classList.remove("mirror");
  video.srcObject = null;
  video.src = URL.createObjectURL(file);
  await once(video, "loadedmetadata");
  await video.play().catch(() => {}); video.pause();
  sizeCanvas();
  state.rec = newRec("video_file");
  state.liveThigh = []; state.liveShank = []; state.featBuf = []; state.liveGood = [];
  state.liveSide = null; state.sideVotes = 0;
  state.rotationSet = false;
  const step = 1 / clampRate(), dur = video.duration;
  if (!Number.isFinite(dur) || dur <= 0) { setHint("Could not read this video's length.", true); return; }
  ui.progress.hidden = false; ui.btnCamera.disabled = true;
  const base = state.lastTs + 1;
  for (let t = 0; t < dur; t += step) {
    video.currentTime = t;
    await once(video, "seeked");
    handlePose(detect(nextTs(base + t * 1000)), t, false);
    ui.bar.style.width = `${Math.min(100, (100 * t) / dur)}%`;
  }
  state.lastFileName = file.name;
  ui.progress.hidden = true; ui.btnCamera.disabled = false;
  finalize(file.name);
}

function once(el, ev) { return new Promise((r) => el.addEventListener(ev, r, { once: true })); }

// ---------- results ----------
// Build the session from the recording. `override` = movement chosen on the results screen.
function finalize(fileName, override = null, scroll = true) {
  const rec = state.rec;
  if (!rec || rec.right.length < 3) {
    setHint("Too few frames with a detected person. Record at least a few seconds.", true);
    return;
  }
  const movement = override ?? ui.movement.value;
  const legPick = ui.side.value !== "auto"
    ? { side: ui.side.value, reason: "set by you" }
    : pickLeg(rec.feats, movement);
  const side = legPick.side;
  const frames = rec[side];
  const analysis = analyzeFrames(frames);
  const rotUsed = Object.entries(rec.rotations).sort((a, b) => b[1] - a[1])[0]?.[0];
  const evaluation = evaluate(movement, analysis, rec);
  state.analysis = analysis;
  state.evaluation = evaluation;
  state.session = {
    patient_id: null,
    exercise: movement,
    evaluation,
    test_selected_by: "user",
    side, side_reason: legPick.reason,
    camera_view: null, coordinate_units: "pixels",
    image_width_px: rec.width, image_height_px: rec.height, frames,
    source: {
      app: "rehabinated-joint-tracker", app_version: APP_VERSION,
      pose_model: `mediapipe pose_landmarker_${state.modelKind}`, delegate: state.delegate,
      capture: rec.mode, file_name: fileName ?? null,
      sample_rate_hz: clampRate(), frames_without_pose: rec.noPose,
      detection_rotation_deg: rotUsed != null ? Number(rotUsed) : 0,
      recorded_at: new Date().toISOString(),
    },
  };
  renderResults(analysis, side, rec.noPose, movement);
  prefillPrevious();
  $("results").hidden = false;
  if (scroll) $("results").scrollIntoView({ behavior: "smooth" });
}

const deg = (v) => (Number.isFinite(v) ? `${v.toFixed(1)}°` : "--");
const r1 = (v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : null);

// Test-specific result, computed from trusted frames only.
function evaluate(test, a, rec) {
  if (TESTS[test]?.kind === "chair_stand") {
    const series = a.rows.filter((r) => r.status === "valid").map((r) => ({ t: r.t_s, flex: r.flexion_deg }));
    const c = countChairStands(series, { startT: rec.chairStartT ?? null });
    return {
      type: "chair_stand_30s", stands_30s: c.reps,
      start_s: r1(c.t0), end_s: r1(c.tEnd), covers_full_30s: !!c.coversWindow,
      halfway_stand_counted: c.halfwayCounted,
      stands: c.stands.map((st) => ({ t_s: r1(st.t), knee_at_stand_deg: r1(st.minFlex), fully_straight: st.fullyStraight })),
      thresholds_deg: { sitting: CHAIR.sitDeg, standing: CHAIR.standDeg, fully_straight: CHAIR.fullStandDeg },
      timing: rec.chairStartT != null ? "from countdown Go" : "from first rise", note: c.note,
    };
  }
  if (TESTS[test]?.kind === "rom") {
    return { type: test, best_extension_deg: r1(a.summary?.extension_lag_deg),
             max_flexion_deg: r1(a.summary?.peak_flexion_deg), rom_deg: r1(a.summary?.rom_deg) };
  }
  return { type: "unknown" };
}

function renderEval(e) {
  const box = $("evalBox");
  if (e.type === "chair_stand_30s") {
    const bent = e.stands.filter((s) => !s.fully_straight).length;
    box.innerHTML = `<span class="big">${e.stands_30s}</span> stands in 30 s` +
      `<span class="sub2">${e.halfway_stand_counted ? "Includes one stand more than halfway up at 30 s. " : ""}` +
      `${bent ? `${bent} stand${bent > 1 ? "s" : ""} without a fully straight knee (&gt; ${e.thresholds_deg.fully_straight}°). ` : "Knee straight at every stand. "}` +
      `Timed ${e.timing}. ${e.note}</span>`;
  } else if (e.type === "unknown") {
    box.innerHTML = `<span class="sub2">Pick the test above to see its result.</span>`;
  } else {
    box.innerHTML = `Best straightening <span class="big">${e.best_extension_deg ?? "--"}°</span>` +
      ` · deepest bend <span class="big">${e.max_flexion_deg ?? "--"}°</span>` +
      `<span class="sub2">0° = fully straight. Straightening is how far the knee stays short of straight.</span>`;
  }
}

function renderResults(a, side, noPose, movement) {
  ui.resMovement.value = movement;
  $("resHow").textContent = "Wrong test? Change it here and the result is recalculated.";
  const rom = TESTS[movement]?.kind === "rom";
  $("sLag").parentElement.classList.toggle("primary", rom);
  $("sPeak").parentElement.classList.toggle("primary", rom);
  $("sRom").parentElement.classList.toggle("primary", false);
  renderEval(state.evaluation);
  $("sLag").textContent = deg(a.summary?.extension_lag_deg);
  $("sPeak").textContent = deg(a.summary?.peak_flexion_deg);
  $("sRom").textContent = deg(a.summary?.rom_deg);
  $("sFrames").textContent = `${a.validFrames}/${a.totalFrames}`;
  const rejected = a.rows.filter((r) => r.status === "rejected");
  const reasons = {};
  for (const r of rejected) { const k = r.reason.split(" (")[0]; reasons[k] = (reasons[k] || 0) + 1; }
  const parts = [`${side[0].toUpperCase()}${side.slice(1)} leg (${state.session.side_reason}).`];
  if (rejected.length) parts.push(`Rejected: ${Object.entries(reasons).map(([k, n]) => `${n} × ${k}`).join(", ")}.`);
  if (noPose) parts.push(`${noPose} frames had no person detected.`);
  if (!a.enoughFrames) parts.push("Not enough reliable frames for a decision: re-record side-on, whole leg visible.");
  if (a.smoothing !== "none") parts.push(`Smoothing: ${a.smoothing}.`);
  $("quality").textContent = parts.join(" ");
  drawChart(a.rows);
  drawTable(a.rows);
}

function drawChart(rows) {
  const svg = $("chart"), tip = $("tip");
  const W = svg.clientWidth || 600, H = 220, m = { l: 34, r: 10, t: 10, b: 24 };
  const tMax = Math.max(1, ...rows.map((r) => r.t_s));
  const vals = rows.map((r) => r.flexion_deg).filter(Number.isFinite);
  const yMax = Math.max(90, Math.ceil((Math.max(...vals) + 10) / 30) * 30);
  const x = (t) => m.l + (t / tMax) * (W - m.l - m.r);
  const y = (v) => H - m.b - (Math.max(0, v) / yMax) * (H - m.t - m.b);
  const ns = "http://www.w3.org/2000/svg";
  const el = (tag, attrs, text) => {
    const e = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (text != null) e.textContent = text;
    return e;
  };
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.replaceChildren();
  const grid = el("g", { class: "grid" });
  for (let v = 0; v <= yMax; v += 30) {
    grid.append(el("line", { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v) }));
    svg.append(el("text", { x: m.l - 6, y: y(v) + 4, "text-anchor": "end" }, `${v}`));
  }
  svg.append(grid);
  svg.append(el("text", { x: W - m.r, y: H - 6, "text-anchor": "end" }, `${tMax.toFixed(1)} s`));
  svg.append(el("text", { x: m.l, y: H - 6 }, "0 s"));
  const valid = rows.filter((r) => r.status === "valid");
  const key = (r) => r.flexion_smoothed_deg ?? r.flexion_deg;
  if (valid.length > 1) {
    svg.append(el("path", { class: "series",
      d: valid.map((r, i) => `${i ? "L" : "M"}${x(r.t_s).toFixed(1)},${y(key(r)).toFixed(1)}`).join("") }));
  }
  const pts = el("g", {});
  for (const r of rows) {
    if (!Number.isFinite(r.flexion_deg)) continue;
    pts.append(el("circle", { cx: x(r.t_s), cy: y(r.status === "valid" ? key(r) : r.flexion_deg),
      r: rows.length > 120 ? 2.5 : 4.5, class: r.status === "valid" ? "pt" : "rej" }));
  }
  svg.append(pts);
  const cross = el("line", { class: "cross", y1: m.t, y2: H - m.b, visibility: "hidden" });
  svg.append(cross);
  const show = (ev) => {
    const box = svg.getBoundingClientRect();
    const px = ((ev.clientX - box.left) / box.width) * W;
    let best = null;
    for (const r of rows) if (!best || Math.abs(x(r.t_s) - px) < Math.abs(x(best.t_s) - px)) best = r;
    if (!best) return;
    cross.setAttribute("x1", x(best.t_s)); cross.setAttribute("x2", x(best.t_s));
    cross.setAttribute("visibility", "visible");
    tip.hidden = false;
    tip.textContent = `${best.t_s.toFixed(2)} s · ${deg(best.flexion_deg)} · ` +
      (best.status === "valid" ? "used" : `rejected: ${best.reason}`);
    const left = (x(best.t_s) / W) * box.width;
    tip.style.left = `${Math.min(Math.max(0, left - 110), box.width - 220)}px`;
  };
  svg.onpointermove = show; svg.onpointerdown = show;
  svg.onpointerleave = () => { tip.hidden = true; cross.setAttribute("visibility", "hidden"); };
}

function drawTable(rows) {
  const head = "<tr><th>t (s)</th><th>Flexion</th><th>Thigh px</th><th>Shank px</th><th>Status</th></tr>";
  const body = rows.map((r) => `<tr><td>${r.t_s.toFixed(2)}</td><td>${deg(r.flexion_deg)}</td>` +
    `<td>${r.thigh_px.toFixed(0)}</td><td>${r.shank_px.toFixed(0)}</td>` +
    `<td class="${r.status === "valid" ? "" : "rej"}">${r.status === "valid" ? "used" : escapeHtml(r.reason)}</td></tr>`).join("");
  $("table").innerHTML = `<table>${head}${body}</table>`;
}

function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]); }

// ---------- export ----------
const num = (id) => { const v = $(id).value.trim(); return v === "" ? null : Number(v); };

function buildSession() {
  const s = structuredClone(state.session);
  s.patient_id = $("pid").value.trim() || "P-anon";
  s.camera_view = $("sagittal").checked ? "sagittal" : "unknown";
  const tLag = num("tLag"), tRom = num("tRom");
  if (tLag != null && tRom != null) s.targets = { max_extension_lag_deg: tLag, min_rom_deg: tRom };
  const pain = num("pain");
  if (pain != null) s.pain_0_10 = pain;
  const prev = {};
  if (num("pLag") != null) prev.extension_lag_deg = num("pLag");
  if (num("pRom") != null) prev.rom_deg = num("pRom");
  if (num("pPain") != null) prev.pain_0_10 = num("pPain");
  if (Object.keys(prev).length) s.previous_session = prev;
  return s;
}

function sessionFile() {
  const s = buildSession();
  remember(s);
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  return new File([JSON.stringify(s, null, 1)], `knee_session_${s.patient_id}_${stamp}.json`,
    { type: "application/json" });
}

async function share() {
  if (!state.session) return;
  const file = sessionFile();
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: "Knee session" }); return; }
    catch (e) { if (e.name === "AbortError") return; }
  }
  download(file);
}

function download(file = sessionFile()) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file); a.download = file.name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// Remember each session's summary per patient ID and movement on this phone,
// to prefill "last session" next time.
const historyKey = (pid, exercise) => `${pid}|${exercise}`;

function remember(s) {
  if (!state.analysis?.summary) return;
  try {
    const all = JSON.parse(localStorage.getItem("kneeHistory2") || "{}");
    all[historyKey(s.patient_id, s.exercise)] = {
      extension_lag_deg: +state.analysis.summary.extension_lag_deg.toFixed(1),
      peak_flexion_deg: +state.analysis.summary.peak_flexion_deg.toFixed(1),
      rom_deg: +state.analysis.summary.rom_deg.toFixed(1), pain_0_10: s.pain_0_10 ?? null,
      saved_at: new Date().toISOString() };
    localStorage.setItem("kneeHistory2", JSON.stringify(all));
  } catch { /* storage unavailable: skip */ }
}

function prefillPrevious() {
  const fields = { pLag: "extension_lag_deg", pRom: "rom_deg", pPain: "pain_0_10" };
  // Clear values this function filled earlier (e.g. for another movement), keep typed ones.
  for (const [id, v] of Object.entries(state.prefilled ?? {})) if ($(id).value === String(v)) $(id).value = "";
  state.prefilled = {};
  try {
    const all = JSON.parse(localStorage.getItem("kneeHistory2") || "{}");
    const last = all[historyKey($("pid").value.trim(), state.session.exercise)];
    if (!last) return;
    for (const [id, key] of Object.entries(fields)) {
      if (!$(id).value && last[key] != null) { $(id).value = last[key]; state.prefilled[id] = last[key]; }
    }
  } catch { /* storage unavailable: skip */ }
}

// ---------- wiring ----------
ui.btnCamera.onclick = () => startCamera();
ui.btnRecord.onclick = () => toggleRecord();
ui.file.onchange = (e) => analyzeFile(e.target.files[0]).finally(() => { e.target.value = ""; });
ui.model.onchange = () => loadModel(ui.model.value);
ui.movement.onchange = () => { state.rotationSet = false; state.rotation = 0; state.liveGood = []; renderTest(); };
// Changing the leg after a recording recalculates the result for that leg.
ui.side.onchange = () => {
  state.liveSide = null; state.sideVotes = 0;
  if (!$("results").hidden && state.rec) finalize(state.lastFileName, ui.resMovement.value, false);
};
ui.resMovement.onchange = () => finalize(state.lastFileName, ui.resMovement.value, false);
ui.facing.onchange = () => { if (state.stream) { stopCamera(); startCamera(); } };
$("btnShare").onclick = () => share();
$("btnDownload").onclick = () => state.session && download();
window.addEventListener("resize", () => state.analysis && drawChart(state.analysis.rows));
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState === "visible" && state.stream && !state.wakeLock) {
    try { state.wakeLock = await navigator.wakeLock?.request("screen"); } catch { /* optional */ }
  }
});

if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
  ui.hint.textContent = "Camera needs HTTPS. Open the GitHub Pages link, not a local file.";
}
try { const saved = localStorage.getItem(TEST_KEY); if (saved && TESTS[saved]) ui.movement.value = saved; } catch { /* optional */ }
renderTest();
loadModel("lite");
