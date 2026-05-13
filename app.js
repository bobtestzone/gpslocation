const els = {
  statusTitle: document.querySelector("#statusTitle"),
  networkStatus: document.querySelector("#networkStatus"),
  lat: document.querySelector("#lat"),
  lng: document.querySelector("#lng"),
  accuracy: document.querySelector("#accuracy"),
  altitude: document.querySelector("#altitude"),
  speed: document.querySelector("#speed"),
  heading: document.querySelector("#heading"),
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
};

const storageKey = "offline-gps-track-v1";
const ctx = els.canvas.getContext("2d");
const tileSize = 256;
const taiwanCenter = { lat: 23.75, lng: 121.0 };

let watchId = null;
let lastPosition = null;
let track = loadTrack();
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

function formatSpeed(value) {
  return Number.isFinite(value) ? `${(value * 3.6).toFixed(1)} km/h` : "--";
}

function formatHeading(value) {
  return Number.isFinite(value) ? `${Math.round(value)} deg` : "--";
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

function loadTrack() {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) || "[]");
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

function saveTrack() {
  localStorage.setItem(storageKey, JSON.stringify(track.slice(-2000)));
}

function updatePosition(position) {
  const { latitude, longitude, accuracy, altitude, speed, heading } = position.coords;
  lastPosition = position;

  els.lat.textContent = formatNumber(latitude, 7);
  els.lng.textContent = formatNumber(longitude, 7);
  els.accuracy.textContent = formatMeters(accuracy);
  els.altitude.textContent = formatMeters(altitude);
  els.speed.textContent = formatSpeed(speed);
  els.heading.textContent = formatHeading(heading);
  setStatus("定位中");

  const nextPoint = {
    lat: latitude,
    lng: longitude,
    accuracy,
    altitude,
    speed,
    heading,
    time: new Date(position.timestamp).toISOString(),
  };

  mapState.center = nextPoint;
  const previous = track.at(-1);
  if (!previous || distanceMeters(previous, nextPoint) >= 2) {
    track.push(nextPoint);
    saveTrack();
  }
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

  if (track.length === 0) {
    drawEmptyTrack(width, height);
    return;
  }

  const toCanvas = (point) => {
    const pixel = lngLatToPixel(point, mapState.zoom);
    return {
      x: (view.cssWidth / 2 + pixel.x - centerPixel.x) * ratio,
      y: (view.cssHeight / 2 + pixel.y - centerPixel.y) * ratio,
    };
  };

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
  ctx.fillText("尚無軌跡", width / 2, height / 2);
}

function zoomMap(delta) {
  mapState.zoom = Math.max(5, Math.min(18, mapState.zoom + delta));
  renderMap();
}

function centerOnCurrentPosition() {
  if (track.length > 0) {
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
  if (track.length === 0) return;
  const trkpts = track
    .map((point) => {
      const ele = Number.isFinite(point.altitude) ? `<ele>${point.altitude}</ele>` : "";
      return `<trkpt lat="${point.lat}" lon="${point.lng}">${ele}<time>${point.time}</time></trkpt>`;
    })
    .join("");
  const gpx = `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="Offline GPS"><trk><name>Offline GPS Track</name><trkseg>${trkpts}</trkseg></trk></gpx>`;
  const blob = new Blob([gpx], { type: "application/gpx+xml" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `gps-track-${new Date().toISOString().slice(0, 10)}.gpx`;
  link.click();
  URL.revokeObjectURL(url);
}

function clearTrack() {
  track = [];
  saveTrack();
  centerOnCurrentPosition();
}

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

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js");
  });
}

updateNetworkStatus();
renderMap();
startWatching();
