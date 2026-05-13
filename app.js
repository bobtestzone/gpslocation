const els = {
  statusTitle: document.querySelector("#statusTitle"),
  networkStatus: document.querySelector("#networkStatus"),
  lat: document.querySelector("#lat"),
  lng: document.querySelector("#lng"),
  accuracy: document.querySelector("#accuracy"),
  altitude: document.querySelector("#altitude"),
  speed: document.querySelector("#speed"),
  recordTabBtn: document.querySelector("#recordTabBtn"),
  historyTabBtn: document.querySelector("#historyTabBtn"),
  recordView: document.querySelector("#recordView"),
  historyView: document.querySelector("#historyView"),
  recordName: document.querySelector("#recordName"),
  recordBtn: document.querySelector("#recordBtn"),
  recordIcon: document.querySelector("#recordIcon"),
  recordLabel: document.querySelector("#recordLabel"),
  recordStatus: document.querySelector("#recordStatus"),
  elapsedTime: document.querySelector("#elapsedTime"),
  recordDistance: document.querySelector("#recordDistance"),
  elevationGain: document.querySelector("#elevationGain"),
  routeDate: document.querySelector("#routeDate"),
  routeDistance: document.querySelector("#routeDistance"),
  routeTime: document.querySelector("#routeTime"),
  altitudeRange: document.querySelector("#altitudeRange"),
  totalAscent: document.querySelector("#totalAscent"),
  totalDescent: document.querySelector("#totalDescent"),
  pointCount: document.querySelector("#pointCount"),
  mapViewport: document.querySelector("#mapViewport"),
  tileLayer: document.querySelector("#tileLayer"),
  mapMode: document.querySelector("#mapMode"),
  canvas: document.querySelector("#trackCanvas"),
  refreshBtn: document.querySelector("#refreshBtn"),
  zoomInBtn: document.querySelector("#zoomInBtn"),
  zoomOutBtn: document.querySelector("#zoomOutBtn"),
  centerMapBtn: document.querySelector("#centerMapBtn"),
  copyBtn: document.querySelector("#copyBtn"),
  shareBtn: document.querySelector("#shareBtn"),
  exportBtn: document.querySelector("#exportBtn"),
  clearBtn: document.querySelector("#clearBtn"),
  historyCount: document.querySelector("#historyCount"),
  historyList: document.querySelector("#historyList"),
};

const sessionKey = "offline-gps-recording-session-v1";
const recordsKey = "offline-gps-records-v1";
const legacyTrackKey = "offline-gps-track-v1";
const ctx = els.canvas.getContext("2d");
const tileSize = 256;
const taiwanCenter = { lat: 23.75, lng: 121.0 };

let watchId = null;
let lastPosition = null;
let currentPoint = null;
let session = loadSession();
let track = session.track;
let savedRecords = loadRecords();
let statsTimer = null;
let wakeLock = null;
let mapState = {
  center: track.at(-1) || taiwanCenter,
  zoom: track.length > 0 ? 15 : 7,
  dragging: false,
  dragStart: null,
  dragCenterPixel: null,
};

function formatNumber(value, digits = 6) {
  return Number.isFinite(value) ? value.toFixed(digits) : "--";
}

function formatMeters(value) {
  return Number.isFinite(value) ? `${Math.round(value)} m` : "--";
}

function formatMetersZh(value) {
  return Number.isFinite(value) ? `${Math.round(value)} 公尺` : "--";
}

function formatKilometers(value) {
  return Number.isFinite(value) ? `${(value / 1000).toFixed(2)} 公里` : "0 公里";
}

function formatSpeed(value) {
  return Number.isFinite(value) ? `${(value * 3.6).toFixed(1)} km/h` : "--";
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function setStatus(text, warning = false) {
  els.statusTitle.textContent = text;
  els.statusTitle.classList.toggle("is-warning", warning);
}

function updateNetworkStatus() {
  const online = navigator.onLine;
  els.networkStatus.textContent = online ? "有網路" : "離線";
  els.networkStatus.classList.toggle("is-offline", !online);
  els.mapMode.textContent = online ? "線上地圖" : "離線軌跡";
  els.tileLayer.classList.toggle("is-hidden", !online);
  renderMap();
}

function loadSession() {
  try {
    const stored = JSON.parse(localStorage.getItem(sessionKey) || "null");
    if (stored && Array.isArray(stored.track)) {
      return {
        id: stored.id || createRecordId(),
        name: stored.name || "",
        isRecording: Boolean(stored.isRecording),
        startedAt: Number.isFinite(stored.startedAt) ? stored.startedAt : null,
        elapsedBefore: Number.isFinite(stored.elapsedBefore) ? stored.elapsedBefore : 0,
        track: stored.track,
      };
    }
  } catch {
    // Fall through to legacy migration.
  }

  let legacyTrack = [];
  try {
    const storedLegacy = JSON.parse(localStorage.getItem(legacyTrackKey) || "[]");
    legacyTrack = Array.isArray(storedLegacy) ? storedLegacy : [];
  } catch {
    legacyTrack = [];
  }

  return {
    id: createRecordId(),
    name: "",
    isRecording: false,
    startedAt: null,
    elapsedBefore: 0,
    track: legacyTrack,
  };
}

function loadRecords() {
  try {
    const stored = JSON.parse(localStorage.getItem(recordsKey) || "[]");
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

function saveRecords() {
  localStorage.setItem(recordsKey, JSON.stringify(savedRecords.slice(0, 50)));
}

function saveSession() {
  localStorage.setItem(sessionKey, JSON.stringify({
    id: session.id,
    name: session.name,
    isRecording: session.isRecording,
    startedAt: session.startedAt,
    elapsedBefore: session.elapsedBefore,
    track: track.slice(-5000),
  }));
}

function createRecordId() {
  return `record-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function defaultRecordName() {
  const now = new Date();
  const date = now.toLocaleDateString("zh-TW", { month: "2-digit", day: "2-digit" });
  const time = now.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `健行 ${date} ${time}`;
}

function elapsedMs() {
  if (!session.isRecording || !session.startedAt) return session.elapsedBefore;
  return session.elapsedBefore + Date.now() - session.startedAt;
}

function totalDistanceMeters(points) {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += distanceMeters(points[i - 1], points[i]);
  }
  return total;
}

function totalElevationGain(points) {
  let gain = 0;
  for (let i = 1; i < points.length; i += 1) {
    const previous = points[i - 1].altitude;
    const current = points[i].altitude;
    if (!Number.isFinite(previous) || !Number.isFinite(current)) continue;
    const delta = current - previous;
    if (delta > 3) gain += delta;
  }
  return gain;
}

function totalElevationLoss(points) {
  let loss = 0;
  for (let i = 1; i < points.length; i += 1) {
    const previous = points[i - 1].altitude;
    const current = points[i].altitude;
    if (!Number.isFinite(previous) || !Number.isFinite(current)) continue;
    const delta = previous - current;
    if (delta > 3) loss += delta;
  }
  return loss;
}

function altitudeRangeMeters(points) {
  const altitudes = points.map((point) => point.altitude).filter(Number.isFinite);
  if (altitudes.length === 0) return 0;
  return Math.max(...altitudes) - Math.min(...altitudes);
}

function routeDateText(points) {
  const time = points[0]?.time || (session.startedAt ? new Date(session.startedAt).toISOString() : null);
  if (!time) return "--";
  return new Date(time).toLocaleDateString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function updateRecordingUi() {
  const hasRecord = track.length > 0 || elapsedMs() > 0;
  els.recordName.value = session.name || "";
  els.recordName.disabled = session.isRecording;
  els.recordBtn.classList.toggle("is-recording", session.isRecording);
  els.recordIcon.textContent = session.isRecording ? "■" : "▶";
  els.recordLabel.textContent = session.isRecording ? "停止記錄" : "開始記錄";
  els.recordStatus.textContent = session.isRecording ? "記錄中" : hasRecord ? "已暫停" : "未記錄";
  els.elapsedTime.textContent = formatDuration(elapsedMs());
  els.recordDistance.textContent = formatMeters(totalDistanceMeters(track));
  els.elevationGain.textContent = formatMeters(totalElevationGain(track));
  els.routeDate.textContent = routeDateText(track);
  els.routeDistance.textContent = formatKilometers(totalDistanceMeters(track));
  els.routeTime.textContent = formatDuration(elapsedMs());
  els.altitudeRange.textContent = formatMetersZh(altitudeRangeMeters(track));
  els.totalAscent.textContent = formatMetersZh(totalElevationGain(track));
  els.totalDescent.textContent = formatMetersZh(totalElevationLoss(track));
}

async function requestWakeLock() {
  if (!("wakeLock" in navigator) || wakeLock) return;
  try {
    wakeLock = await navigator.wakeLock.request("screen");
    wakeLock.addEventListener("release", () => {
      wakeLock = null;
    });
  } catch {
    wakeLock = null;
  }
}

async function releaseWakeLock() {
  if (!wakeLock) return;
  const lock = wakeLock;
  wakeLock = null;
  await lock.release();
}

function startRecording() {
  if (!session.name.trim()) {
    session.name = els.recordName.value.trim() || defaultRecordName();
  }
  if (track.length === 0 && session.elapsedBefore === 0) {
    session.id = createRecordId();
  }
  session.isRecording = true;
  session.startedAt = Date.now();
  if (currentPoint && (track.length === 0 || distanceMeters(track.at(-1), currentPoint) >= 2)) {
    track.push(currentPoint);
  }
  saveSession();
  updateRecordingUi();
  renderMap();
  requestWakeLock();
}

function stopRecording() {
  session.elapsedBefore = elapsedMs();
  session.isRecording = false;
  session.startedAt = null;
  saveSession();
  saveRecordSnapshot();
  updateRecordingUi();
  renderHistory();
  releaseWakeLock();
}

function toggleRecording() {
  if (session.isRecording) stopRecording();
  else startRecording();
}

function saveRecordSnapshot() {
  if (track.length === 0 && elapsedMs() === 0) return;
  const record = {
    id: session.id,
    name: session.name || els.recordName.value.trim() || defaultRecordName(),
    updatedAt: new Date().toISOString(),
    elapsedMs: elapsedMs(),
    distanceMeters: totalDistanceMeters(track),
    elevationGain: totalElevationGain(track),
    elevationLoss: totalElevationLoss(track),
    altitudeRange: altitudeRangeMeters(track),
    track: track.slice(),
  };
  savedRecords = [record, ...savedRecords.filter((item) => item.id !== record.id)];
  saveRecords();
}

function setActiveView(view) {
  const showHistory = view === "history";
  els.recordView.classList.toggle("is-hidden", showHistory);
  els.historyView.classList.toggle("is-hidden", !showHistory);
  els.recordTabBtn.classList.toggle("is-active", !showHistory);
  els.historyTabBtn.classList.toggle("is-active", showHistory);
  if (showHistory) renderHistory();
}

function updatePosition(position) {
  const { latitude, longitude, accuracy, altitude, speed, heading } = position.coords;
  lastPosition = position;

  els.lat.textContent = formatNumber(latitude, 7);
  els.lng.textContent = formatNumber(longitude, 7);
  els.accuracy.textContent = formatMeters(accuracy);
  els.altitude.textContent = formatMeters(altitude);
  els.speed.textContent = formatSpeed(speed);
  setStatus("定位中");

  currentPoint = {
    lat: latitude,
    lng: longitude,
    accuracy,
    altitude,
    speed,
    heading,
    time: new Date(position.timestamp).toISOString(),
  };

  mapState.center = currentPoint;
  if (session.isRecording) {
    const previous = track.at(-1);
    if (!previous || distanceMeters(previous, currentPoint) >= 2) {
      track.push(currentPoint);
      saveSession();
    }
  }

  updateRecordingUi();
  renderMap();
}

function handleLocationError(error) {
  const messages = {
    1: "沒有權限",
    2: "無法定位",
    3: "定位逾時",
  };
  setStatus(messages[error.code] || "定位失敗", true);
}

function startWatching() {
  if (!("geolocation" in navigator)) {
    setStatus("不支援 GPS", true);
    return;
  }

  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
  }

  setStatus("搜尋 GPS");
  watchId = navigator.geolocation.watchPosition(updatePosition, handleLocationError, {
    enableHighAccuracy: true,
    maximumAge: 1000,
    timeout: 15000,
  });
}

function distanceMeters(a, b) {
  const radius = 6371000;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return radius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function lngLatToPixel(point, zoom) {
  const scale = tileSize * 2 ** zoom;
  const sinLat = Math.sin((point.lat * Math.PI) / 180);
  return {
    x: ((point.lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale,
  };
}

function pixelToLngLat(pixel, zoom) {
  const scale = tileSize * 2 ** zoom;
  const lng = (pixel.x / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * pixel.y) / scale;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { lat, lng };
}

function sizeCanvasToViewport() {
  const rect = els.mapViewport.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(320, Math.round(rect.width * ratio));
  const height = Math.max(240, Math.round(rect.height * ratio));
  if (els.canvas.width !== width || els.canvas.height !== height) {
    els.canvas.width = width;
    els.canvas.height = height;
  }
  return { cssWidth: rect.width, cssHeight: rect.height, ratio };
}

function renderMap() {
  const view = sizeCanvasToViewport();
  const centerPixel = lngLatToPixel(mapState.center, mapState.zoom);
  renderTiles(view, centerPixel);
  drawTrack(view, centerPixel);
}

function renderTiles(view, centerPixel) {
  els.tileLayer.innerHTML = "";
  if (!navigator.onLine) return;

  const zoom = mapState.zoom;
  const worldTiles = 2 ** zoom;
  const left = centerPixel.x - view.cssWidth / 2;
  const top = centerPixel.y - view.cssHeight / 2;
  const startX = Math.floor(left / tileSize);
  const endX = Math.floor((left + view.cssWidth) / tileSize);
  const startY = Math.floor(top / tileSize);
  const endY = Math.floor((top + view.cssHeight) / tileSize);

  for (let x = startX; x <= endX; x += 1) {
    for (let y = startY; y <= endY; y += 1) {
      if (y < 0 || y >= worldTiles) continue;
      const wrappedX = ((x % worldTiles) + worldTiles) % worldTiles;
      const tile = document.createElement("img");
      tile.alt = "";
      tile.decoding = "async";
      tile.loading = "lazy";
      tile.src = `https://tile.openstreetmap.org/${zoom}/${wrappedX}/${y}.png`;
      tile.style.left = `${Math.round(x * tileSize - left)}px`;
      tile.style.top = `${Math.round(y * tileSize - top)}px`;
      els.tileLayer.append(tile);
    }
  }
}

function drawTrack(view, centerPixel) {
  const width = els.canvas.width;
  const height = els.canvas.height;
  const ratio = view.ratio;
  ctx.clearRect(0, 0, width, height);
  els.pointCount.textContent = `${track.length} 點`;

  const toCanvas = (point) => {
    const pixel = lngLatToPixel(point, mapState.zoom);
    return {
      x: (view.cssWidth / 2 + pixel.x - centerPixel.x) * ratio,
      y: (view.cssHeight / 2 + pixel.y - centerPixel.y) * ratio,
    };
  };

  if (track.length === 0) {
    drawEmptyTrack(width, height);
  } else {
    ctx.lineWidth = 5 * ratio;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = "#0f766e";
    ctx.beginPath();
    track.map(toCanvas).forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.stroke();

    drawMarker(toCanvas(track[0]), "#334155", 8 * ratio, ratio);
    drawMarker(toCanvas(track.at(-1)), "#dc2626", 10 * ratio, ratio);
  }

  if (currentPoint) {
    drawMarker(toCanvas(currentPoint), "#2563eb", 7 * ratio, ratio);
  }
}

function drawMarker(point, color, radius, ratio) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 3 * ratio;
  ctx.strokeStyle = "#fff";
  ctx.stroke();
}

function drawEmptyTrack(width, height) {
  ctx.fillStyle = "#66736f";
  ctx.font = `${22 * (window.devicePixelRatio || 1)}px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText("按開始記錄", width / 2, height / 2);
}

function zoomMap(delta) {
  mapState.zoom = Math.max(5, Math.min(18, mapState.zoom + delta));
  renderMap();
}

function centerOnCurrentPosition() {
  if (currentPoint) {
    mapState.center = currentPoint;
    mapState.zoom = Math.max(mapState.zoom, 15);
  } else if (track.length > 0) {
    mapState.center = track.at(-1);
    mapState.zoom = Math.max(mapState.zoom, 15);
  } else {
    mapState.center = taiwanCenter;
    mapState.zoom = 7;
  }
  renderMap();
}

function pointerPoint(event) {
  const rect = els.mapViewport.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function startDrag(event) {
  mapState.dragging = true;
  mapState.dragStart = pointerPoint(event);
  mapState.dragCenterPixel = lngLatToPixel(mapState.center, mapState.zoom);
  els.mapViewport.setPointerCapture(event.pointerId);
}

function moveDrag(event) {
  if (!mapState.dragging) return;
  const current = pointerPoint(event);
  const dx = current.x - mapState.dragStart.x;
  const dy = current.y - mapState.dragStart.y;
  mapState.center = pixelToLngLat({
    x: mapState.dragCenterPixel.x - dx,
    y: mapState.dragCenterPixel.y - dy,
  }, mapState.zoom);
  renderMap();
}

function endDrag(event) {
  mapState.dragging = false;
  if (els.mapViewport.hasPointerCapture(event.pointerId)) {
    els.mapViewport.releasePointerCapture(event.pointerId);
  }
}

function renderHistory() {
  els.historyCount.textContent = `${savedRecords.length} 筆`;
  els.historyList.innerHTML = "";

  if (savedRecords.length === 0) {
    const empty = document.createElement("p");
    empty.className = "history-empty";
    empty.textContent = "還沒有歷史記錄。完成一次記錄後，會保存在這裡。";
    els.historyList.append(empty);
    return;
  }

  savedRecords.forEach((record) => {
    const item = document.createElement("article");
    item.className = "history-item";

    const title = document.createElement("h3");
    title.textContent = record.name || "未命名記錄";

    const meta = document.createElement("p");
    const date = record.updatedAt ? new Date(record.updatedAt).toLocaleString("zh-TW") : "";
    meta.textContent = `${date} · ${formatDuration(record.elapsedMs || 0)} · ${formatKilometers(record.distanceMeters || 0)} · 爬升 ${formatMeters(record.elevationGain || 0)} · ${record.track?.length || 0} 點`;

    const actions = document.createElement("div");
    actions.className = "history-actions";
    actions.append(
      historyButton("載入", () => loadRecord(record.id)),
      historyButton("改名", () => renameRecord(record.id), "secondary"),
      historyButton("匯出", () => exportRecord(record.id), "secondary"),
      historyButton("刪除", () => deleteRecord(record.id), "danger"),
    );

    item.append(title, meta, actions);
    els.historyList.append(item);
  });
}

function historyButton(label, handler, className = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  if (className) button.className = className;
  button.addEventListener("click", handler);
  return button;
}

function loadRecord(id) {
  const record = savedRecords.find((item) => item.id === id);
  if (!record) return;
  if (session.isRecording) stopRecording();
  session = {
    id: record.id,
    name: record.name,
    isRecording: false,
    startedAt: null,
    elapsedBefore: record.elapsedMs || 0,
    track: Array.isArray(record.track) ? record.track.slice() : [],
  };
  track = session.track;
  saveSession();
  updateRecordingUi();
  centerOnCurrentPosition();
  setActiveView("record");
}

function renameRecord(id) {
  const record = savedRecords.find((item) => item.id === id);
  if (!record) return;
  const nextName = window.prompt("新的紀錄名稱", record.name || "");
  if (!nextName || !nextName.trim()) return;
  record.name = nextName.trim();
  record.updatedAt = new Date().toISOString();
  if (session.id === id) {
    session.name = record.name;
    saveSession();
    updateRecordingUi();
  }
  saveRecords();
  renderHistory();
}

function deleteRecord(id) {
  const record = savedRecords.find((item) => item.id === id);
  if (!record) return;
  const ok = window.confirm(`刪除「${record.name || "未命名記錄"}」？`);
  if (!ok) return;
  savedRecords = savedRecords.filter((item) => item.id !== id);
  saveRecords();
  renderHistory();
}

function exportRecord(id) {
  const record = savedRecords.find((item) => item.id === id);
  if (!record) return;
  exportTrackAsGpx(record.track || [], record.name || "Hiking GPS Record");
}

async function copyCoordinates() {
  if (!lastPosition) return;
  const { latitude, longitude, accuracy } = lastPosition.coords;
  const accuracyText = Number.isFinite(accuracy) ? `, 精度 ${Math.round(accuracy)} m` : "";
  await navigator.clipboard.writeText(`GPS: ${latitude.toFixed(7)}, ${longitude.toFixed(7)}${accuracyText}`);
}

async function shareCoordinates() {
  if (!lastPosition) return;
  const { latitude, longitude } = lastPosition.coords;
  const text = `我的位置: ${latitude.toFixed(7)}, ${longitude.toFixed(7)}`;
  if (navigator.share) {
    await navigator.share({ title: "GPS 位置", text });
  } else {
    await navigator.clipboard.writeText(text);
  }
}

function exportGpx() {
  exportTrackAsGpx(track, session.name || "Hiking GPS Record");
}

function exportTrackAsGpx(points, name) {
  if (points.length === 0) return;
  const safeName = name.replace(/[<>&'"]/g, "");
  const trkpts = points
    .map((point) => {
      const ele = Number.isFinite(point.altitude) ? `<ele>${point.altitude}</ele>` : "";
      return `<trkpt lat="${point.lat}" lon="${point.lng}">${ele}<time>${point.time}</time></trkpt>`;
    })
    .join("");
  const gpx = `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="Offline GPS"><metadata><time>${new Date().toISOString()}</time></metadata><trk><name>${safeName}</name><trkseg>${trkpts}</trkseg></trk></gpx>`;
  const blob = new Blob([gpx], { type: "application/gpx+xml" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeName || "gps-record"}-${new Date().toISOString().slice(0, 10)}.gpx`;
  link.click();
  URL.revokeObjectURL(url);
}

function clearTrack() {
  if (session.isRecording) stopRecording();
  track = [];
  session = {
    id: createRecordId(),
    name: "",
    isRecording: false,
    startedAt: null,
    elapsedBefore: 0,
    track,
  };
  localStorage.removeItem(legacyTrackKey);
  saveSession();
  updateRecordingUi();
  centerOnCurrentPosition();
}

els.recordBtn.addEventListener("click", toggleRecording);
els.recordName.addEventListener("input", () => {
  if (session.isRecording) return;
  session.name = els.recordName.value;
  saveSession();
});
els.recordTabBtn.addEventListener("click", () => setActiveView("record"));
els.historyTabBtn.addEventListener("click", () => setActiveView("history"));
els.refreshBtn.addEventListener("click", startWatching);
els.zoomInBtn.addEventListener("click", () => zoomMap(1));
els.zoomOutBtn.addEventListener("click", () => zoomMap(-1));
els.centerMapBtn.addEventListener("click", centerOnCurrentPosition);
els.copyBtn.addEventListener("click", copyCoordinates);
els.shareBtn.addEventListener("click", shareCoordinates);
els.exportBtn.addEventListener("click", exportGpx);
els.clearBtn.addEventListener("click", clearTrack);
els.mapViewport.addEventListener("pointerdown", startDrag);
els.mapViewport.addEventListener("pointermove", moveDrag);
els.mapViewport.addEventListener("pointerup", endDrag);
els.mapViewport.addEventListener("pointercancel", endDrag);
window.addEventListener("resize", renderMap);
window.addEventListener("online", updateNetworkStatus);
window.addEventListener("offline", updateNetworkStatus);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && session.isRecording) {
    requestWakeLock();
  }
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js");
  });
}

statsTimer = window.setInterval(updateRecordingUi, 1000);
updateNetworkStatus();
updateRecordingUi();
renderHistory();
if (session.isRecording) requestWakeLock();
renderMap();
startWatching();
