// ===================== MODULES =====================

/**
 * App State Module
 * Centralized state management
 */
const AppState = {
  // Core elements
  video: null,
  canvas: null,
  buffer: null,
  
  // Model state
  modelReady: false,
  detections: [],
  
  // UI state
  mirror: true,
  cameraActive: false,
  capturing: false,
  gridSize: 4,
  shots: [],
  currentShot: 0,
  countdown: 0,
  lastExpression: "neutral",
  readyFlash: { text: "", until: 0 },
  
  // Effects
  emojisFloating: [],
  
  // DOM elements cache
  ui: {}
};

/**
 * Constants Module
 */
const Constants = {
  EMOJI_PRESETS: {
    happy: { symbols: ["😊", "😍", "😄", "🥰", "💖", "💕"], color: [255, 100, 150] },
    sad: { symbols: ["😢", "😭", "😞", "💔"], color: [100, 180, 255] },
    angry: { symbols: ["😡", "😠", "🤬", "💢"], color: [255, 80, 80] },
    surprised: { symbols: ["😮", "😲", "🤯", "🌟"], color: [255, 220, 150] },
    neutral: { symbols: ["🙂", "😐", "😶", "👍"], color: [200, 200, 200] }
  },
  
  BACKGROUND_COLORS: {
    happy: [255, 250, 180, 100],
    sad: [150, 200, 255, 100],
    angry: [255, 150, 150, 100],
    surprised: [230, 190, 255, 100],
    neutral: [240, 240, 240, 80]
  },
  
  EXPRESSION_TEXTS: {
    happy: "Ekspresi: Senang 😊",
    sad: "Ekspresi: Sedih 😢",
    angry: "Ekspresi: Marah 😠",
    surprised: "Ekspresi: Terkejut 😲",
    neutral: "Ekspresi: Netral 😐"
  },
  
  BADGE_TEXTS: {
    happy: "😊 Senang",
    sad: "😢 Sedih",
    angry: "😠 Marah",
    surprised: "😲 Terkejut",
    neutral: "😐 Netral"
  },
  
  MODEL_URL: 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights/',
  FRAME_RATE: 24,
  BUFFER_WIDTH: 640,
  BUFFER_HEIGHT: 480,
  MAX_FLOATING_EMOJIS: 30,
  TRIM_FLOATING_EMOJIS: 20,
  EMOJI_SPAWN_COUNT: 8,
  CONFETTI_COUNT: 8,
  BACKGROUND_EMOJI_COUNT: 12
};

// ===================== CORE MODULES =====================

/**
 * Camera Module
 */
const CameraModule = {
  async initialize() {
    try {
      await this.setupVideo();
    } catch (error) {
      this.showPlaceholder();
    }
  },
  
  setupVideo() {
    return new Promise((resolve, reject) => {
      try {
        AppState.video = createCapture({
          video: {
            width: { ideal: Constants.BUFFER_WIDTH },
            height: { ideal: Constants.BUFFER_HEIGHT },
            facingMode: "user"
          },
          audio: false
        });
        
        AppState.video.hide();
        
        AppState.video.elt.onloadeddata = () => {
          if (AppState.video.width > 0 && AppState.video.height > 0) {
            AppState.cameraActive = true;
            this.removeLoader();
            UIModule.setStatus("Kamera siap! Ekspresikan wajahmu 😄");
            resolve();
          } else {
            this.showPlaceholder();
            reject(new Error("Video dimensions invalid"));
          }
        };
        
        AppState.video.elt.onerror = () => {
          this.showPlaceholder();
          reject(new Error("Video error"));
        };
      } catch (error) {
        this.showPlaceholder();
        reject(error);
      }
    });
  },
  
  removeLoader() {
    const loader = document.getElementById("loading-state");
    if (loader) loader.style.display = "none";
  },
  
  showPlaceholder() {
    const container = document.getElementById("canvas-container");
    const existingCanvas = container.querySelector('canvas');
    if (existingCanvas) existingCanvas.style.display = 'none';
    
    const placeholder = document.createElement("div");
    placeholder.id = "camera-placeholder";
    placeholder.style.cssText = `
      width: 100%;
      height: 500px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      background: rgba(255, 240, 245, 0.9);
      border-radius: 10px;
    `;
    
    placeholder.innerHTML = `
      <div style="font-size: 64px; margin-bottom: 20px;">📷❌</div>
      <p style="color: #d63384; font-weight: bold; margin-bottom: 10px;">Kamera tidak dapat diakses</p>
      <p style="color: #666; margin-bottom: 20px; text-align: center; max-width: 300px;">
        Pastikan Anda memberikan izin akses kamera
      </p>
      <button id="retryCameraBtn" class="primary-btn" style="
        background: #d63384;
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 20px;
        cursor: pointer;
        font-weight: bold;
      ">Coba Lagi</button>
    `;
    
    container.appendChild(placeholder);
    UIModule.setStatus("Menunggu akses kamera...");
  },
  
  retry() {
    const placeholder = document.getElementById("camera-placeholder");
    if (placeholder) placeholder.remove();
    
    const canvas = document.querySelector('#canvas-container canvas');
    if (canvas) canvas.style.display = 'block';
    
    const loading = document.getElementById('loading-state');
    if (loading) loading.style.display = 'block';
    
    UIModule.setStatus("Memuat kamera...");
    
    setTimeout(() => {
      this.initialize();
    }, 500);
  }
};

/**
 * Model Module
 */
const ModelModule = {
  async load() {
    try {
      await faceapi.nets.tinyFaceDetector.loadFromUri(Constants.MODEL_URL);
      await faceapi.nets.faceExpressionNet.loadFromUri(Constants.MODEL_URL);
      AppState.modelReady = true;
      console.log("Models loaded");
      UIModule.setStatus("Model ekspresi siap! 😊");
    } catch (error) {
      console.log("Using fallback mode");
      AppState.modelReady = false;
      UIModule.setStatus("Model ekspresi tidak tersedia, tetap bisa foto!");
    }
  }
};

/**
 * Face Detection Module
 */
const FaceDetectionModule = {
  async detect() {
    if (!AppState.video || !AppState.modelReady || AppState.capturing) return;
    
    try {
      AppState.detections = await faceapi
        .detectAllFaces(AppState.video.elt, new faceapi.TinyFaceDetectorOptions())
        .withFaceExpressions();
      
      if (AppState.detections.length > 0) {
        this.processDetection(AppState.detections[0]);
      }
    } catch (error) {
      // Silent fail for better UX
    }
  },
  
  processDetection(detection) {
    const box = detection.detection.box;
    const expressions = detection.expressions;
    const mostLikely = Object.keys(expressions).reduce((a, b) => 
      expressions[a] > expressions[b] ? a : b
    );
    
    if (mostLikely !== AppState.lastExpression) {
      AppState.lastExpression = mostLikely;
      UIModule.updateExpressionBadge(mostLikely);
      EmojiModule.spawnExpressionEmojis(mostLikely, box);
    }
    
    this.drawFaceIndicator(box);
  },
  
  drawFaceIndicator(box) {
    if (!box || AppState.capturing) return;
    
    const { x: videoX, y: videoY, width: videoW, height: videoH } = 
      VideoModule.getVideoCanvasCoordinates();
    
    const scaleX = videoW / AppState.video.width;
    const scaleY = videoH / AppState.video.height;
    
    let faceX = videoX + box.x * scaleX;
    let faceY = videoY + box.y * scaleY;
    let faceW = box.width * scaleX;
    let faceH = box.height * scaleY;
    
    if (AppState.mirror) {
      faceX = videoX + videoW - (faceX - videoX) - faceW;
    }
    
    push();
    noFill();
    stroke(255, 255, 255, 200);
    strokeWeight(2);
    rect(faceX, faceY, faceW, faceH);
    
    fill(255, 255, 255, 220);
    noStroke();
    ellipse(faceX + faceW/2, faceY + faceH/2, 10, 10);
    pop();
  }
};

/**
 * Video Module
 */
const VideoModule = {
  getVideoCanvasCoordinates() {
    const videoRatio = AppState.video.width / AppState.video.height;
    const canvasRatio = width / height;
    
    if (videoRatio > canvasRatio) {
      const drawWidth = width;
      const drawHeight = drawWidth / videoRatio;
      return {
        x: 0,
        y: (height - drawHeight) / 2,
        width: drawWidth,
        height: drawHeight
      };
    } else {
      const drawHeight = height;
      const drawWidth = drawHeight * videoRatio;
      return {
        x: (width - drawWidth) / 2,
        y: 0,
        width: drawWidth,
        height: drawHeight
      };
    }
  },
  
  drawToBuffer() {
    if (!AppState.video || AppState.video.width === 0) return;
    
    AppState.buffer.clear();
    AppState.buffer.push();
    
    if (AppState.mirror) {
      AppState.buffer.translate(AppState.buffer.width, 0);
      AppState.buffer.scale(-1, 1);
    }
    
    AppState.buffer.image(
      AppState.video, 
      0, 0, 
      AppState.buffer.width, 
      AppState.buffer.height
    );
    
    AppState.buffer.textAlign(CENTER, CENTER);
    for (let e of AppState.emojisFloating) {
      if (e.alpha > 50) {
        AppState.buffer.textSize(e.size);
        AppState.buffer.fill(255, e.alpha);
        AppState.buffer.text(
          e.symbol, 
          e.x * (AppState.buffer.width / width), 
          e.y * (AppState.buffer.height / height)
        );
      }
    }
    
    AppState.buffer.pop();
  }
};

/**
 * Emoji Module
 */
const EmojiModule = {
  spawnExpressionEmojis(expression, box) {
    const preset = Constants.EMOJI_PRESETS[expression] || Constants.EMOJI_PRESETS.neutral;
    
    for (let i = 0; i < Constants.EMOJI_SPAWN_COUNT; i++) {
      this.createFloatingEmoji(preset, box);
    }
    
    const expressionText = Constants.EXPRESSION_TEXTS[expression] || "Ekspresi terdeteksi!";
    UIModule.setStatus(expressionText);
  },
  
  createFloatingEmoji(preset, box) {
    const symbol = random(preset.symbols);
    const col = color(preset.color[0], preset.color[1], preset.color[2]);
    
    let x, y;
    
    if (box) {
      const { x: videoX, y: videoY, width: videoW, height: videoH } = 
        VideoModule.getVideoCanvasCoordinates();
      
      const scaleX = videoW / AppState.video.width;
      const scaleY = videoH / AppState.video.height;
      
      let faceX = videoX + box.x * scaleX + box.width * scaleX / 2;
      let faceY = videoY + box.y * scaleY + box.height * scaleY / 2;
      
      if (AppState.mirror) {
        faceX = videoX + videoW - (faceX - videoX);
      }
      
      x = faceX + random(-40, 40);
      y = faceY + random(-30, 30);
    } else {
      x = random(width);
      y = random(height - 100, height);
    }
    
    AppState.emojisFloating.push({
      symbol: symbol,
      x: x,
      y: y,
      vx: random(-1, 1),
      vy: random(-2, -3),
      size: random(18, 28),
      color: col,
      alpha: 255,
      life: 80
    });
  },
  
  updateFloatingEmojis() {
    for (let i = AppState.emojisFloating.length - 1; i >= 0; i--) {
      const e = AppState.emojisFloating[i];
      
      e.x += e.vx;
      e.y += e.vy;
      e.alpha -= 3;
      e.life--;
      
      if (e.life <= 0 || e.alpha <= 0) {
        AppState.emojisFloating.splice(i, 1);
        continue;
      }
      
      push();
      textSize(e.size);
      fill(e.color.levels[0], e.color.levels[1], e.color.levels[2], e.alpha);
      text(e.symbol, e.x, e.y);
      pop();
    }
    
    // Limit for performance
    if (AppState.emojisFloating.length > Constants.MAX_FLOATING_EMOJIS) {
      AppState.emojisFloating = AppState.emojisFloating.slice(-Constants.TRIM_FLOATING_EMOJIS);
    }
  },
  
  createConfetti() {
    const container = document.getElementById("canvas-container");
    const emojis = ["✨", "🎉", "⭐", "💥", "🎊", "🌟", "💖", "💫"];
    
    for (let i = 0; i < Constants.CONFETTI_COUNT; i++) {
      const e = document.createElement("div");
      e.className = "emoji-decoration";
      e.textContent = random(emojis);
      e.style.left = `${random(10, 90)}%`;
      e.style.top = `${random(20, 50)}%`;
      e.style.fontSize = `${random(16, 24)}px`;
      e.style.color = `hsl(${random(0, 360)}, 100%, 60%)`;
      
      container.appendChild(e);
      
      setTimeout(() => {
        if (e.parentNode) e.parentNode.removeChild(e);
      }, 2000);
    }
  },
  
  initBackgroundEmojis() {
    const container = document.getElementById("emoji-bg-container");
    if (!container) return;
    
    const emojis = ["✨", "🎈", "🎊", "⭐", "🌼", "🌸", "💫", "🌟", "💖", "💕"];
    
    for (let i = 0; i < Constants.BACKGROUND_EMOJI_COUNT; i++) {
      const e = document.createElement("div");
      e.className = "emoji-bg";
      e.textContent = random(emojis);
      e.style.left = `${random(0, 100)}%`;
      e.style.top = `${random(0, 100)}%`;
      e.style.fontSize = `${random(20, 36)}px`;
      e.style.opacity = random(0.03, 0.06);
      e.style.transform = `rotate(${random(0, 360)}deg)`;
      e.style.animation = `float ${random(15, 25)}s ease-in-out infinite`;
      e.style.animationDelay = `${random(0, 10)}s`;
      
      container.appendChild(e);
    }
  }
};

/**
 * Capture Module
 */
const CaptureModule = {
  async startSequence() {
    if (!AppState.cameraActive) {
      alert("Kamera belum siap!");
      return;
    }
    
    if (AppState.capturing) return;
    
    AppState.capturing = true;
    AppState.shots = [];
    AppState.currentShot = 0;
    
    UIModule.updateProgress(true);
    
    UIModule.showFlash("Bersiap! Ekspresikan wajahmu! 😄");
    await Utils.delay(1500);
    
    for (let i = 0; i < AppState.gridSize; i++) {
      AppState.countdown = 3;
      
      while (AppState.countdown > 0) {
        UIModule.updateCountdownUI();
        await Utils.delay(1000);
        AppState.countdown--;
      }
      
      UIModule.updateCountdownUI();
      await Utils.delay(200);
      
      this.capturePhoto();
      EmojiModule.createConfetti();
      UIModule.showFlash(`Foto ${i + 1} berhasil! 📸`);
      
      if (i < AppState.gridSize - 1) {
        await Utils.delay(800);
      }
    }
    
    this.finishCapture();
    AppState.capturing = false;
  },
  
  capturePhoto() {
    if (frameCount % 2 === 0) {
      VideoModule.drawToBuffer();
    }
    
    const imgData = AppState.buffer.canvas.toDataURL("image/jpeg", 0.9);
    AppState.shots.push(imgData);
    AppState.currentShot++;
    
    UIModule.updateProgress();
    
    setTimeout(() => {
      UIModule.addToGallery(imgData, AppState.currentShot);
    }, 100);
  },
  
  finishCapture() {
    this.createCollage();
    UIModule.showFlash("Semua foto selesai! 🎉");
    UIModule.setStatus("Collage siap diunduh!");
    document.getElementById("downloadBtn").classList.remove("hidden");
  },
  
  createCollage() {
    if (AppState.shots.length === 0) return;
    
    const total = AppState.shots.length;
    const cols = Math.ceil(Math.sqrt(total));
    const rows = Math.ceil(total / cols);
    
    const cw = 320;
    const ch = 240;
    const collageWidth = cw * cols;
    const collageHeight = ch * rows;
    
    const collageCanvas = document.createElement("canvas");
    collageCanvas.width = collageWidth;
    collageCanvas.height = collageHeight;
    const ctx = collageCanvas.getContext("2d");
    
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, collageWidth, collageHeight);
    
    let loadedCount = 0;
    
    AppState.shots.forEach((src, index) => {
      const img = new Image();
      img.src = src;
      
      img.onload = () => {
        const x = (index % cols) * cw;
        const y = Math.floor(index / cols) * ch;
        
        ctx.drawImage(img, x, y, cw, ch);
        
        ctx.strokeStyle = "#d63384";
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, cw, ch);
        
        loadedCount++;
        
        if (loadedCount === total) {
          const collageData = collageCanvas.toDataURL("image/png");
          document.getElementById("downloadBtn").dataset.collage = collageData;
        }
      };
    });
  }
};

/**
 * UI Module
 */
const UIModule = {
  initialize() {
    this.cacheDOMElements();
    this.setupEventListeners();
    this.removeLoadingState();
  },
  
  cacheDOMElements() {
    AppState.ui = {
      status: document.getElementById("status"),
      countdown: document.getElementById("countdown"),
      expressionBadge: document.getElementById("expression-badge"),
      progress: document.getElementById("shot-progress"),
      downloadBtn: document.getElementById("downloadBtn")
    };
  },
  
  setupEventListeners() {
    // Grid buttons
    document.querySelectorAll(".grid-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".grid-btn").forEach(b => 
          b.classList.remove("active")
        );
        btn.classList.add("active");
        AppState.gridSize = parseInt(btn.dataset.grid, 10);
        this.setStatus(`Grid ${AppState.gridSize} foto dipilih`);
      });
    });
    
    // Buttons
    document.getElementById("captureBtn").addEventListener("click", () => 
      CaptureModule.startSequence()
    );
    
    document.getElementById("resetBtn").addEventListener("click", this.resetPhotobooth);
    document.getElementById("downloadBtn").addEventListener("click", this.downloadCollage);
    document.getElementById("mirrorToggle").addEventListener("click", this.toggleMirror);
    
    // Keyboard shortcuts
    document.addEventListener("keydown", (e) => {
      if (e.key.toLowerCase() === "m") this.toggleMirror();
    });
    
    // Retry camera
    document.addEventListener('click', (e) => {
      if (e.target && e.target.id === 'retryCameraBtn') {
        CameraModule.retry();
      }
    });
  },
  
  removeLoadingState() {
    const loading = document.getElementById("loading-state");
    if (loading) loading.style.display = "none";
  },
  
  setStatus(message) {
    if (AppState.ui.status) {
      AppState.ui.status.textContent = message;
    }
  },
  
  updateExpressionBadge(expression) {
    if (AppState.ui.expressionBadge) {
      const text = Constants.BADGE_TEXTS[expression] || "⋯";
      AppState.ui.expressionBadge.textContent = text;
    }
  },
  
  showFlash(message) {
    AppState.readyFlash.text = message;
    AppState.readyFlash.until = millis() + 1200;
  },
  
  updateCountdownUI() {
    if (AppState.ui.countdown) {
      if (AppState.countdown > 0) {
        AppState.ui.countdown.textContent = AppState.countdown;
        AppState.ui.countdown.classList.remove("hidden");
      } else {
        AppState.ui.countdown.classList.add("hidden");
      }
    }
  },
  
  updateProgress(initial = false) {
    if (AppState.ui.progress) {
      const current = initial ? 0 : AppState.currentShot;
      AppState.ui.progress.textContent = `${current} / ${AppState.gridSize}`;
      AppState.ui.progress.classList.remove("hidden");
    }
  },
  
  addToGallery(imgData, index) {
    const gallery = document.getElementById("photoGallery");
    
    const imgContainer = document.createElement("div");
    imgContainer.className = "photo-item";
    
    const img = document.createElement("img");
    img.src = imgData;
    img.alt = `Foto ${index}`;
    img.title = `Ekspresi: ${AppState.lastExpression}`;
    
    const label = document.createElement("div");
    label.className = "photo-label";
    label.textContent = `Foto ${index}`;
    
    imgContainer.appendChild(img);
    imgContainer.appendChild(label);
    gallery.appendChild(imgContainer);
    
    // Limit gallery items
    const items = gallery.querySelectorAll(".photo-item");
    if (items.length > 8) gallery.removeChild(items[0]);
  },
  
  downloadCollage() {
    const data = document.getElementById("downloadBtn").dataset.collage;
    if (!data) {
      alert("Belum ada collage yang tersedia!");
      return;
    }
    
    const a = document.createElement("a");
    a.href = data;
    a.download = `moodpop-collage-${new Date().toISOString().slice(0, 10)}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    this.showFlash("Collage berhasil diunduh! 💾");
  },
  
  resetPhotobooth() {
    AppState.shots = [];
    AppState.currentShot = 0;
    AppState.capturing = false;
    AppState.emojisFloating = [];
    
    document.getElementById("photoGallery").innerHTML = "";
    document.getElementById("downloadBtn").classList.add("hidden");
    
    this.updateProgress(true);
    this.setStatus("Photobooth direset! Kamera siap! 😊");
  },
  
  toggleMirror() {
    AppState.mirror = !AppState.mirror;
    this.setStatus(AppState.mirror ? "Mirror: ON 🪞" : "Mirror: OFF");
  }
};

/**
 * Utils Module
 */
const Utils = {
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },
  
  random(arr) {
    if (Array.isArray(arr)) {
      return arr[Math.floor(Math.random() * arr.length)];
    } else if (typeof arr === "number") {
      return Math.random() * arr;
    } else {
      return Math.random() * (arguments[1] - arguments[0]) + arguments[0];
    }
  }
};

// Override global random function
function random(arr) {
  return Utils.random(arr);
}

// ===================== P5.JS FUNCTIONS =====================

function preload() {
  setTimeout(async () => {
    await ModelModule.load();
  }, 100);
}

function setup() {
  const container = document.getElementById('canvas-container');
  const width = container.clientWidth;
  const height = Math.min(500, width * 0.75);
  
  AppState.canvas = createCanvas(width, height);
  AppState.canvas.parent("canvas-container");
  
  AppState.buffer = createGraphics(
    Constants.BUFFER_WIDTH, 
    Constants.BUFFER_HEIGHT
  );
  
  UIModule.initialize();
  CameraModule.initialize();
  EmojiModule.initBackgroundEmojis();
  
  frameRate(Constants.FRAME_RATE);
  textAlign(CENTER, CENTER);
}

function draw() {
  drawBackground();
  
  if (AppState.cameraActive && AppState.video && AppState.video.width > 0) {
    drawVideo();
    
    if (frameCount % 5 === 0) {
      VideoModule.drawToBuffer();
    }
    
    if (frameCount % 15 === 0 && AppState.modelReady) {
      FaceDetectionModule.detect();
    }
  } else {
    drawCameraLoading();
  }
  
  EmojiModule.updateFloatingEmojis();
  drawUI();
}

function drawBackground() {
  const color = Constants.BACKGROUND_COLORS[AppState.lastExpression] || 
                Constants.BACKGROUND_COLORS.neutral;
  background(color[0], color[1], color[2], color[3]);
}

function drawVideo() {
  push();
  
  const { x, y, width: videoW, height: videoH } = 
    VideoModule.getVideoCanvasCoordinates();
  
  if (AppState.mirror) {
    translate(x + videoW, y);
    scale(-1, 1);
    image(AppState.video, 0, 0, videoW, videoH);
  } else {
    image(AppState.video, x, y, videoW, videoH);
  }
  
  pop();
}

function drawCameraLoading() {
  fill(214, 51, 132);
  textSize(16);
  text("Memuat kamera...", width / 2, height / 2);
}

function drawUI() {
  if (AppState.countdown > 0) {
    drawCountdown();
  }
  
  if (millis() < AppState.readyFlash.until) {
    drawReadyFlash();
  }
}

function drawCountdown() {
  push();
  textSize(100);
  fill(255, 255, 255, 0.9);
  textStyle(BOLD);
  text(AppState.countdown, width/2, height/2);
  pop();
}

function drawReadyFlash() {
  if (millis() > AppState.readyFlash.until) return;
  
  push();
  fill(0, 0, 0, 180);
  noStroke();
  rect(0, height - 70, width, 70);
  
  fill(255);
  textSize(18);
  textAlign(CENTER, CENTER);
  text(AppState.readyFlash.text, width/2, height - 35);
  pop();
}