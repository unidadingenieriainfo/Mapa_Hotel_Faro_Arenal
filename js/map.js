// ============================================================
// js/map.js — Mapa interactivo
// Marcadores: estilo circular con pulse animation (Lecturas_Senal)
// Tooltip:    rico con RSSI badge y datos técnicos
// Drag&Drop:  modo edición (Mapa_Hotel_Faro_Arenal)
// ============================================================

import { classifyRSSI } from './points.js';

// ── Estado interno ───────────────────────────────────────────
let _mapContainer = null;
let _mapImage     = null;
let _editMode     = false;
let _tooltip      = null;

let _onPointClick = null;
let _onMapClick   = null;
let _onPointMoved = null;

const _points = new Map();  // pointId → pointData

// ── Inicialización ───────────────────────────────────────────

export function initMap({ containerId, imageId, onPointClick, onMapClick, onPointMoved }) {
  _mapContainer = document.getElementById(containerId);
  _mapImage     = document.getElementById(imageId);
  _tooltip      = document.getElementById('map-tooltip');
  _onPointClick = onPointClick;
  _onMapClick   = onMapClick;
  _onPointMoved = onPointMoved;

  _mapContainer.addEventListener('click', _handleMapClick);
}

// ── Modo edición ─────────────────────────────────────────────

export function setEditMode(active) {
  _editMode = active;
  _mapContainer.style.cursor = active ? 'crosshair' : 'default';
}

// ── Renderizado ───────────────────────────────────────────────

/** Renderiza todos los puntos */
export function renderPoints(points) {
  _clearMarkers();
  _points.clear();
  points.forEach(p => {
    _points.set(p.id, p);
    _createMarkerElement(p);
  });
}

/** Agrega o actualiza un marcador individual */
export function upsertMarker(point) {
  _points.set(point.id, point);
  const existing = document.getElementById(`marker-${point.id}`);
  if (existing) existing.remove();
  _createMarkerElement(point);
}

/** Elimina un marcador */
export function removeMarker(pointId) {
  document.getElementById(`marker-${pointId}`)?.remove();
  _points.delete(pointId);
}

// ── Filtros ───────────────────────────────────────────────────

export function applyFilters({ cabinet = '', rssiClass = '' }) {
  _points.forEach((point, id) => {
    const el = document.getElementById(`marker-${id}`);
    if (!el) return;
    const { className } = classifyRSSI(point.rssi);
    const matchCabinet  = !cabinet   || point.cabinet === cabinet;
    const matchRssi     = !rssiClass || className     === rssiClass;
    el.style.display = (matchCabinet && matchRssi) ? '' : 'none';
  });
}

// ── Crear marcador (estilo Lecturas_Senal: circular + pulse) ──

function _createMarkerElement(point) {
  const { label, className, color } = classifyRSSI(point.rssi);

  const marker = document.createElement('div');
  marker.id        = `marker-${point.id}`;
  marker.className = `map-marker ${className}`;
  marker.dataset.id = point.id;
  marker.style.left = `${point.x_percent}%`;
  marker.style.top  = `${point.y_percent}%`;

  // Círculo principal (Lecturas_Senal style)
  const circle = document.createElement('div');
  circle.className = 'marker-circle';

  // Etiqueta con nombre truncado
  const labelEl = document.createElement('div');
  labelEl.className   = 'marker-label';
  labelEl.textContent = _truncate(point.name, 14);

  marker.append(circle, labelEl);

  // Tooltip al hover (Lecturas_Senal + datos técnicos)
  marker.addEventListener('mouseenter', (e) => {
    _showTooltip(point, marker, label, color);
    marker.classList.add('active');
  });
  marker.addEventListener('mouseleave', () => {
    _hideTooltip();
    marker.classList.remove('active');
  });

  // Clic: ver detalle o abrir visor
  marker.addEventListener('click', (e) => {
    e.stopPropagation();
    _onPointClick?.(point.id);
  });

  // Drag & drop (modo edición)
  _addDragBehavior(marker, point.id);

  _mapContainer.appendChild(marker);
}

// ── Tooltip rico (Lecturas_Senal + datos WiFi) ────────────────

function _showTooltip(point, markerEl, qualityLabel, color) {
  if (!_tooltip) return;

  const photosCount = point.photos?.length ?? 0;

  _tooltip.innerHTML = `
    <div class="tt-header">
      <span class="tt-name">${_esc(point.name)}</span>
      <span class="tt-badge" style="background:${color}">${point.rssi} dBm</span>
    </div>
    <div class="tt-body">
      <div class="tt-row">
        <span>Calidad</span>
        <span style="color:${color};font-weight:600">${qualityLabel}</span>
      </div>
      ${point.cabinet ? `<div class="tt-row"><span>Gabinete</span><span>${_esc(point.cabinet)}</span></div>` : ''}
      ${point.room    ? `<div class="tt-row"><span>Habitación</span><span>${_esc(point.room)}</span></div>` : ''}
      ${point.zone    ? `<div class="tt-row"><span>Zona</span><span>${_esc(point.zone)}</span></div>` : ''}
    </div>
    ${photosCount ? `<div class="tt-photos">📷 ${photosCount} foto${photosCount !== 1 ? 's' : ''} disponible${photosCount !== 1 ? 's' : ''}</div>` : ''}
  `;
  _tooltip.classList.add('tt-visible');

  // Posición: encima del marcador, centrado
  const contRect   = _mapContainer.getBoundingClientRect();
  const markerRect = markerEl.getBoundingClientRect();
  const ttW  = 240;
  const ttH  = _tooltip.offsetHeight || 120;

  let left = markerRect.left - contRect.left + markerRect.width / 2 - ttW / 2;
  let top  = markerRect.top  - contRect.top  - ttH - 14;

  // Clamping horizontal
  left = Math.max(8, Math.min(left, contRect.width - ttW - 8));
  // Si no cabe arriba, moverlo abajo
  if (top < 8) top = markerRect.bottom - contRect.top + 8;

  _tooltip.style.left  = `${left}px`;
  _tooltip.style.top   = `${top}px`;
  _tooltip.style.width = `${ttW}px`;
}

function _hideTooltip() {
  _tooltip?.classList.remove('tt-visible');
}

// ── Drag & drop ───────────────────────────────────────────────

function _addDragBehavior(marker, pointId) {
  let dragging = false;
  let startX, startY, origLeft, origTop;

  marker.addEventListener('mousedown', (e) => {
    if (!_editMode) return;
    e.preventDefault();
    e.stopPropagation();

    dragging = true;
    startX   = e.clientX;
    startY   = e.clientY;
    origLeft = parseFloat(marker.style.left);
    origTop  = parseFloat(marker.style.top);
    marker.classList.add('dragging');

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  });

  // Touch support
  marker.addEventListener('touchstart', (e) => {
    if (!_editMode) return;
    e.preventDefault();
    const t = e.touches[0];
    dragging = true;
    startX   = t.clientX; startY   = t.clientY;
    origLeft = parseFloat(marker.style.left);
    origTop  = parseFloat(marker.style.top);
    marker.classList.add('dragging');
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend',  onTouchEnd);
  }, { passive: false });

  function onMove(e) { if (dragging) _moveTo(marker, e.clientX, e.clientY, startX, startY, origLeft, origTop); }
  function onTouchMove(e) { e.preventDefault(); if (dragging) { const t = e.touches[0]; _moveTo(marker, t.clientX, t.clientY, startX, startY, origLeft, origTop); } }

  function onUp()       { _finishDrag(marker, pointId); document.removeEventListener('mousemove', onMove);      document.removeEventListener('mouseup',  onUp);       dragging = false; }
  function onTouchEnd() { _finishDrag(marker, pointId); document.removeEventListener('touchmove', onTouchMove); document.removeEventListener('touchend', onTouchEnd); dragging = false; }
}

function _moveTo(marker, cx, cy, sx, sy, origLeft, origTop) {
  const rect = _mapContainer.getBoundingClientRect();
  const dx   = cx - sx;
  const dy   = cy - sy;
  const newLeft = Math.max(0, Math.min(100, origLeft + (dx / rect.width)  * 100));
  const newTop  = Math.max(0, Math.min(100, origTop  + (dy / rect.height) * 100));
  marker.style.left = `${newLeft}%`;
  marker.style.top  = `${newTop}%`;
}

function _finishDrag(marker, pointId) {
  marker.classList.remove('dragging');
  const xPercent = parseFloat(marker.style.left);
  const yPercent = parseFloat(marker.style.top);
  const point = _points.get(pointId);
  if (point) { point.x_percent = xPercent; point.y_percent = yPercent; }
  _onPointMoved?.(pointId, xPercent, yPercent);
}

// ── Clic en mapa (crear punto) ────────────────────────────────

function _handleMapClick(e) {
  if (!_editMode) return;
  if (e.target.closest('.map-marker')) return;

  const rect     = _mapContainer.getBoundingClientRect();
  const xPercent = ((e.clientX - rect.left) / rect.width)  * 100;
  const yPercent = ((e.clientY - rect.top)  / rect.height) * 100;

  _onMapClick?.(
    parseFloat(xPercent.toFixed(3)),
    parseFloat(yPercent.toFixed(3))
  );
}

// ── Utilidades ────────────────────────────────────────────────

function _clearMarkers() {
  document.querySelectorAll('.map-marker').forEach(el => el.remove());
}

function _truncate(text, maxLen) {
  return text.length > maxLen ? text.substring(0, maxLen) + '…' : text;
}

function _esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
