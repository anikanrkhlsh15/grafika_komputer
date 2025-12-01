/* ===========================================================
   MoodPop — Refactored (Tipe A)
   Struktur tetap, fungsi sama, lebih bersih & tidak bentrok.
   =========================================================== */

const CAPTURE_W = 640;
const CAPTURE_H = 480;
const COUNTDOWN_START = 5;
const READY_FLASH_MS = 900;

// App State Container
const App = {
  canvas: null,
  video: null,
  buffer: null,
  facemesh: null,
  faces: [],
  emotes: [],
  readyFlash: { text: "", until: 0 },

  timers: { countdown: null },

  state: {
    mirror: true,
    cameraActive: false,
    capturing: false,
    gridSize: 1,
    shots: [],
    currentShot: 0,
    countdown: 0,
    lastExpression: "neutral",
  },

  ui: {}
};

/* ===========================================================
   P5 Setup
   =========================================================== */
function setup() {
  App.canvas = createCanvas(800, 600);
  App.canvas.parent("canvas-container");

  App.buffer = createGraphics(CAPTURE_W, CAPTURE_H);

  cacheDOM();
  removeLoader();
  initUI();
  initMirrorHotkey();
  initBackgroundEmoji();
  initCamera();
  setTimeout(initFacemesh, 600);

  textFont("Arial");
  textAlign(CENTER, CENTER);
}

function draw() {
  background(255, 210, 230);

  if (App.state.cameraActive) {
    const rect = fitRect(App.video.width, App.video.height, width, height);

    drawPreview(rect);
    drawToBuffer();
    drawFaceIndicator(rect);

  } else {
    drawCameraLoading();
  }

  updateCountdownUI();
  drawEmotes();
  drawReadyFlash();
}

/* ===========================================================
   DOM & UI
   =========================================================== */
function cacheDOM() {
  App.ui.status = document.getElementById("status");
  App.ui.gallery = document.getElementById("gallery");
  App.ui.photoList = document.getElementById("photo-list");
  App.ui.countdown = document.getElementById("countdown");
  App.ui.expressionBadge = document.getElementById("expression-badge");
  App.ui.progress = document.getElementById("shot-progress");
  App.ui.download = document.getElementById("download-btn");
}

function removeLoader() {
  const load = document.getElementById("loading-state");
  if (load) load.remove();
}

function initUI() {
  // Grid selection
  document.querySelectorAll(".grid-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".grid-btn")
        .forEach(b => b.classList.remove("active"));

      btn.classList.add("active");

      App.state.gridSize = parseInt(btn.dataset.grid, 10) || 1;
      App.state.shots = [];
      updateProgress(true);

      setStatus(`Grid ${App.state.gridSize} dipilih.`);
    });
  });

  // Capture Button
  document.getElementById("capture-btn").onclick = startCapture;

  // Reset
  document.getElementById("reset-btn").onclick = resetPhotobooth;

  // Download
  App.ui.download.onclick = downloadCollage;

  // Mirror
  document.getElementById("mirror-toggle").onclick = toggleMirror;
}

function initMirrorHotkey() {
  document.addEventListener("keydown", e => {
    if (e.key.toLowerCase() === "m") toggleMirror();
  });
}

function setStatus(msg) {
  if (App.ui.status) App.ui.status.textContent = msg;
}

/* ===========================================================
   Camera
   =========================================================== */
function initCamera() {
  try {
    App.video = createCapture(VIDEO, () => {
      App.state.cameraActive = true;
      setStatus("Kamera siap! 😊");
    });

    App.video.size(CAPTURE_W, CAPTURE_H);
    App.video.hide();

  } catch (e) {
    console.error(e);
    showCameraError();
  }
}

function showCameraError() {
  document.getElementById("canvas-container").innerHTML = `
    <div class="camera-error">
      <div style="font-size:44px">📷❌</div>
      <p>Kamera tidak dapat diakses.</p>
      <button onclick="location.reload()">Coba Lagi</button>
    </div>
  `;
  setStatus("Gagal mengaktifkan kamera.");
}

/* ===========================================================
   Facemesh Init
   =========================================================== */
function initFacemesh() {
  if (!ml5 || !ml5.facemesh) {
    setStatus("Facemesh tidak tersedia.");
    return;
  }

  App.facemesh = ml5.facemesh(App.video, { maxFaces: 1 }, () =>
    setStatus("Model siap mendeteksi ekspresi ❤️")
  );

  App.facemesh.on("predict", results => {
    App.faces = results || [];
    if (App.faces.length) detectExpression(App.faces[0]);
  });
}

/* ===========================================================
   Drawing Helpers
   =========================================================== */
function fitRect(srcW, srcH, dstW, dstH) {
  let w = dstW;
  let h = (srcH / srcW) * w;

  if (h > dstH) {
    h = dstH;
    w = (srcW / srcH) * h;
  }
  return { x: (dstW - w) / 2, y: (dstH - h) / 2, w, h };
}

function drawPreview(rect) {
  push();
  if (App.state.mirror) {
    translate(rect.x + rect.w, 0);
    scale(-1, 1);
    image(App.video, 0, rect.y, rect.w, rect.h);
  } else {
    image(App.video, rect.x, rect.y, rect.w, rect.h);
  }
  pop();
}

function drawCameraLoading() {
  fill(214, 51, 132);
  textSize(18);
  text("Memuat kamera...", width / 2, height / 2);
}

function drawToBuffer() {
  App.buffer.clear();
  App.buffer.push();

  if (App.state.mirror) {
    App.buffer.translate(App.buffer.width, 0);
    App.buffer.scale(-1, 1);
  }

  App.buffer.image(App.video, 0, 0, App.buffer.width, App.buffer.height);
  App.buffer.pop();
}


function drawFaceIndicator(rect) {
  if (!App.faces.length) return;
  const mesh = App.faces[0].scaledMesh;
  if (!mesh || !mesh[1]) return;

  const nose = mesh[1];

  const nx = map(nose[0], 0, CAPTURE_W, rect.x, rect.x + rect.w);
  const ny = map(nose[1], 0, CAPTURE_H, rect.y, rect.y + rect.h);
  const centerX = rect.x + rect.w / 2;
  const drawX = App.state.mirror ? centerX - (nx - centerX) : nx;

  noStroke();
  fill(255, 255, 255, 220);
  ellipse(drawX, ny, 10, 10);
}

/* ===========================================================
   Expression Detection
   =========================================================== */
function detectExpression(prediction) {
  const mesh = prediction.scaledMesh;
  if (!mesh) return;

  const idx = { L: 33, R: 263, ML: 61, MR: 291, MT: 13, MB: 14 };
  const get = i => mesh[i] || null;

  const L = get(idx.L), R = get(idx.R);
  const ML = get(idx.ML), MR = get(idx.MR);
  const MT = get(idx.MT), MB = get(idx.MB);

  if (!L || !R || !ML || !MR || !MT || !MB) return;

  const eyeDist = dist(L[0], L[1], R[0], R[1]);
  const mouthW = dist(ML[0], ML[1], MR[0], MR[1]);
  const mouthH = dist(MT[0], MT[1], MB[0], MB[1]);

  let exp = "neutral";
  if (mouthH / eyeDist > 0.16 && mouthW / eyeDist > 1.2) exp = "surprised";
  else if (mouthH / eyeDist > 0.11) exp = "smiling";
  else if (mouthW / eyeDist < 0.9) exp = "sad";
  else if (mouthW / eyeDist < 0.8) exp = "angry";

  if (exp !== App.state.lastExpression) {
    App.state.lastExpression = exp;
    App.ui.expressionBadge.textContent = toBadge(exp);
    spawnEmojis(exp, mesh[1]);
  }
}

function toBadge(exp) {
  return {
    smiling: "Ekspresi: Senang",
    surprised: "Ekspresi: Terkejut",
    sad: "Ekspresi: Sedih",
    angry: "Ekspresi: Marah",
    neutral: "Ekspresi: Netral"
  }[exp] || "Ekspresi: ⋯";
}

/* ===========================================================
   Emoji Floating Effect
   =========================================================== */
function drawEmotesToBuffer() {
  App.buffer.push();
  App.buffer.textAlign(CENTER, CENTER);

  for (let e of App.emotes) {
    App.buffer.textSize(e.size * (App.buffer.width / width)); // scale emoji
    App.buffer.fill(255);

    const bx = map(e.x, 0, width, 0, App.buffer.width);
    const by = map(e.y, 0, height, 0, App.buffer.height);

    App.buffer.text(e.char, bx, by);
  }

  App.buffer.pop();
}


   function spawnEmojis(exp, nose) {
  const presets = {
    smiling: ["😊", "😍", "😄", "🥰"],
    surprised: ["😮", "😲", "🤯"],
    sad: ["😢", "😭", "😞"],
    angry: ["😡", "😠", "🤬"],
    neutral: ["🙂", "😐", "😶"]
  };

  const chars = presets[exp] || presets.neutral;

  for (let i = 0; i < 6; i++) {
    App.emotes.push({
      char: chars[floor(random(chars.length))],
      x: map(nose[0], 0, CAPTURE_W, 0, width) + random(-30, 30),
      y: map(nose[1], 0, CAPTURE_H, 0, height) + random(-30, 30),
      size: random(18, 34),
      speed: random(1, 2.5),
      life: 80
    });
  }
}

function drawEmotes() {
  for (let i = App.emotes.length - 1; i >= 0; i--) {
    const e = App.emotes[i];
    e.y -= e.speed;
    e.life--;

    if (e.life <= 0) {
      App.emotes.splice(i, 1);
      continue;
    }

    textSize(e.size);
    fill(255);
    text(e.char, e.x, e.y);
  }
}

/* ===========================================================
   Capture Flow
   =========================================================== */
function startCapture() {
  if (!App.state.cameraActive) return alert("Kamera belum siap!");
  if (App.state.capturing) return;

  App.state.capturing = true;
  App.state.shots = [];
  App.state.currentShot = 0;

  updateProgress(true);
  nextShot();
}

function nextShot() {
  if (App.state.currentShot >= App.state.gridSize) {
    finishCapture();
    return;
  }

  App.state.countdown = COUNTDOWN_START;
  updateCountdownUI();

  clearInterval(App.timers.countdown);
  App.timers.countdown = setInterval(() => {
    App.state.countdown--;
    updateCountdownUI();

    if (App.state.countdown <= 0) {
      clearInterval(App.timers.countdown);
      captureFrame();
    }
  }, 1000);
}

function captureFrame() {
  // 1. Gambar ulang kamera ke buffer
  drawToBuffer();

  // 2. Gambar emoji (filter ekspresi) ke buffer
  drawEmotesToBuffer(); // <--- WAJIB agar masuk ke foto

  // 3. Ambil hasil buffer sebagai PNG
  const img = App.buffer.canvas.toDataURL("image/png");

  App.state.shots.push(img);
  App.state.currentShot++;

  updateProgress();

  showFlash(
    App.state.currentShot === App.state.gridSize
      ? "Semua foto diambil!"
      : `Foto ${App.state.currentShot} OK 😄`
  );

  createConfetti();

  setTimeout(nextShot, 600);
}



function finishCapture() {
  App.state.capturing = false;
  makeCollage();
}

function updateProgress(initial = false) {
  App.ui.progress.classList.remove("hidden");
  App.ui.progress.textContent = `${initial ? 0 : App.state.currentShot} / ${App.state.gridSize}`;
}

/* ===========================================================
   Countdown & Flash
   =========================================================== */
function updateCountdownUI() {
  if (App.state.countdown > 0) {
    App.ui.countdown.classList.remove("hidden");
    App.ui.countdown.textContent = App.state.countdown;
  } else {
    App.ui.countdown.classList.add("hidden");
  }
}

function showFlash(text) {
  App.readyFlash.text = text;
  App.readyFlash.until = millis() + READY_FLASH_MS;
}

function drawReadyFlash() {
  if (millis() > App.readyFlash.until) return;

  fill(0, 0, 0, 120);
  rect(0, height - 70, width, 70);

  fill(255);
  textSize(20);
  text(App.readyFlash.text, width / 2, height - 35);
}

/* ===========================================================
   Collage
   =========================================================== */
function makeCollage() {
  const total = App.state.shots.length;
  if (!total) return;

  const cols = Math.ceil(Math.sqrt(total));
  const rows = Math.ceil(total / cols);

  const cw = CAPTURE_W, ch = CAPTURE_H;
  const W = cw * cols, H = ch * rows;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);

  let loaded = 0;

  App.state.shots.forEach((src, i) => {
    const img = new Image();
    img.src = src;

    img.onload = () => {
      const x = (i % cols) * cw;
      const y = Math.floor(i / cols) * ch;
      ctx.drawImage(img, x, y, cw, ch);

      loaded++;
      if (loaded === total) showCollage(canvas.toDataURL());
    };
  });
}

function showCollage(dataURL) {
  App.ui.gallery.classList.remove("hidden");

  const item = document.createElement("div");
  item.className = "photo-item";

  const img = document.createElement("img");
  img.src = dataURL;
  item.appendChild(img);

  App.ui.photoList.prepend(item);

  App.ui.download.dataset.img = dataURL;
  App.ui.download.classList.remove("hidden");

  setStatus("Collage siap diunduh 🎉");
}

function downloadCollage(e) {
  e.preventDefault();
  const data = App.ui.download.dataset.img;
  if (!data) return alert("Belum ada collage.");

  const a = document.createElement("a");
  a.href = data;
  a.download = "moodpop-collage.png";
  a.click();
}

/* ===========================================================
   Reset
   =========================================================== */
function resetPhotobooth() {
  App.state.shots = [];
  App.state.currentShot = 0;
  App.state.capturing = false;

  App.ui.photoList.innerHTML = "";
  App.ui.gallery.classList.add("hidden");
  App.ui.download.classList.add("hidden");

  updateProgress(true);
  setStatus("Kamera siap! 😊");
}

/* ===========================================================
   Mirror
   =========================================================== */
function toggleMirror() {
  App.state.mirror = !App.state.mirror;
  setStatus(App.state.mirror ? "Mirror ON" : "Mirror OFF");
}

/* ===========================================================
   Confetti Animation
   =========================================================== */
function createConfetti() {
  const emojis = ["✨", "🎉", "⭐", "💥"];
  const container = document.getElementById("canvas-container");

  for (let i = 0; i < 12; i++) {
    const e = document.createElement("div");
    e.className = "emoji-decoration";
    e.textContent = emojis[floor(random(emojis.length))];
    e.style.left = `${random(5, 95)}%`;
    e.style.top = `${random(10, 40)}%`;
    e.style.fontSize = `${random(14, 30)}px`;

    container.appendChild(e);
    setTimeout(() => e.remove(), 3800);
  }
}

/* ===========================================================
   Background Emoji
   =========================================================== */
function initBackgroundEmoji() {
  const container = document.getElementById("emoji-bg-container");
  const emo = ["✨", "🎈", "🎊", "⭐", "🌼", "🌸", "💫", "🌟"];

  for (let i = 0; i < 12; i++) {
    const d = document.createElement("div");
    d.className = "emoji-bg";
    d.textContent = emo[floor(random(emo.length))];
    d.style.left = `${random(0, 100)}%`;
    d.style.top = `${random(0, 100)}%`;
    d.style.fontSize = `${random(22, 40)}px`;

    container.appendChild(d);
  }
}
