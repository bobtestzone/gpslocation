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
  canvas: document.querySelector("#trackCanvas"),
  refreshBtn: document.querySelector("#refreshBtn"),
  copyBtn: document.querySelector("#copyBtn"),
  shareBtn: document.querySelector("#shareBtn"),
  exportBtn: document.querySelector("#exportBtn"),
  clearBtn: document.querySelector("#clearBtn"),
};

const storageKey = "offline-gps-track-v1";
const ctx = els.canvas.getContext("2d");
let watchId = null;
let lastPosition = null;
let track = loadTrack();

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

  const previous = track.at(-1);
  if (!previous || distanceMeters(previous, nextPoint) >= 2) {
    track.push(nextPoint);
    saveTrack();
    drawTrack();
  }
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

function projectPoint(point, origin) {
  const metersPerDegreeLat = 111320;
  const metersPerDegreeLng = 111320 * Math.cos((origin.lat * Math.PI) / 180);
  return {
    x: (point.lng - origin.lng) * metersPerDegreeLng,
    y: (point.lat - origin.lat) * metersPerDegreeLat,
  };
}

function drawTrack() {
  const width = els.canvas.width;
  const height = els.canvas.height;
  ctx.clearRect(0, 0, width, height);
  els.pointCount.textContent = `${track.length} 點`;

  if (track.length === 0) {
    drawEmptyTrack(width, height);
    return;
  }

  const origin = track[0];
  const points = track.map((point) => projectPoint(point, origin));
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const padding = 42;
  const scaleX = (width - padding * 2) / Math.max(10, maxX - minX);
  const scaleY = (height - padding * 2) / Math.max(10, maxY - minY);
  const scale = Math.min(scaleX, scaleY);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  const toCanvas = (point) => ({
    x: width / 2 + (point.x - centerX) * scale,
    y: height / 2 - (point.y - centerY) * scale,
  });

  ctx.lineWidth = 6;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = "#0f766e";
  ctx.beginPath();
  points.map(toCanvas).forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.stroke();

  drawMarker(toCanvas(points[0]), "#334155", 9);
  drawMarker(toCanvas(points.at(-1)), "#dc2626", 11);
}

function drawMarker(point, color, radius) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#fff";
  ctx.stroke();
}

function drawEmptyTrack(width, height) {
  ctx.fillStyle = "#66736f";
  ctx.font = "28px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("尚無軌跡", width / 2, height / 2);
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
  drawTrack();
}

els.refreshBtn.addEventListener("click", startWatching);
els.copyBtn.addEventListener("click", copyCoordinates);
els.shareBtn.addEventListener("click", shareCoordinates);
els.exportBtn.addEventListener("click", exportGpx);
els.clearBtn.addEventListener("click", clearTrack);
window.addEventListener("online", updateNetworkStatus);
window.addEventListener("offline", updateNetworkStatus);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js");
  });
}

updateNetworkStatus();
drawTrack();
startWatching();
