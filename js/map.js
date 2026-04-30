// =============================================================
// js/map.js — Mapa interactivo, marcadores y drag & drop
// =============================================================

import { classifyRSSI } from './points.js';

// ─────────────────────────────────────────────────────────────
// Estado interno del módulo
// ─────────────────────────────────────────────────────────────
let _mapContainer  = null;   // div#map-container
let _mapImage      = null;   // img#map-image
let _editMode      = false;
let _onPointClick  = null;   // callback(pointId)
let _onMapClick    = null;   // callback(xPercent, yPercent)
let _onPointMoved  = null;   // callback(pointId, xPercent, yPercent)

/** Colección de puntos actuales: Map<pointId, pointData> */
const _points = new Map();

// ─────────────────────────────────────────────────────────────
// Inicialización del mapa
// ─────────────────────────────────────────────────────────────

/**
 * Inicializa el módulo de mapa.
 * @param {Object} opts
 * @param {string}   opts.containerId  ID del div contenedor del mapa
 * @param {string}   opts.imageId      ID del elemento <img>
 * @param {Function} opts.onPointClick Callback al hacer clic en un marcador
 * @param {Function} opts.onMapClick   Callback al hacer clic en el mapa (modo edición)
 * @param {Function} opts.onPointMoved Callback al soltar un marcador arrastrado
 */
export function initMap({ containerId, imageId, onPointClick, onMapClick, onPointMoved }) {
  _mapContainer = document.getElementById(containerId);
  _mapImage     = document.getElementById(imageId);
  _onPointClick = onPointClick;
  _onMapClick   = onMapClick;
  _onPointMoved = onPointMoved;

  // Clic en mapa para crear punto (solo modo edición)
  _mapContainer.addEventListener('click', _handleMapClick);
}

// ─────────────────────────────────────────────────────────────
// Modo edición
// ─────────────────────────────────────────────────────────────

/** Activa o desactiva el modo edición */
export function setEditMode(active) {
  _editMode = active;
  _mapContainer.classList.toggle('edit-mode', active);
}

// ─────────────────────────────────────────────────────────────
// Renderizado de marcadores
// ─────────────────────────────────────────────────────────────

/**
 * Renderiza todos los puntos sobre el mapa.
 * @param {Array} points  Array de objetos punto desde Supabase
 */
export function renderPoints(points) {
  // Limpiar marcadores anteriores (conserva la imagen)
  _clearMarkers();
  _points.clear();

  points.forEach(p => {
    _points.set(p.id, p);
    _createMarkerElement(p);
  });
}

/**
 * Agrega o actualiza un marcador individual.
 * @param {Object} point
 */
export function upsertMarker(point) {
  _points.set(point.id, point);

  // Eliminar marcador anterior si existe
  const existing = document.getElementById(`marker-${point.id}`);
  if (existing) existing.remove();

  _createMarkerElement(point);
}

/**
 * Elimina un marcador del mapa.
 * @param {string} pointId
 */
export function removeMarker(pointId) {
  const el = document.getElementById(`marker-${pointId}`);
  if (el) el.remove();
  _points.delete(pointId);
}

// ─────────────────────────────────────────────────────────────
// Filtros visuales
// ─────────────────────────────────────────────────────────────

/**
 * Filtra los marcadores visibles según criterios.
 * @param {{ cabinet?: string, rssiClass?: string }} filters
 */
export function applyFilters({ cabinet = '', rssiClass = '' }) {
  _points.forEach((point, id) => {
    const el = document.getElementById(`marker-${id}`);
    if (!el) return;

    const { className } = classifyRSSI(point.rssi);
    const matchCabinet  = !cabinet  || point.cabinet === cabinet;
    const matchRssi     = !rssiClass || className     === rssiClass;

    el.style.display = (matchCabinet && matchRssi) ? '' : 'none';
  });
}

// ─────────────────────────────────────────────────────────────
// Privado: crear elemento marcador
// ─────────────────────────────────────────────────────────────

function _createMarkerElement(point) {
  const { label, className, color } = classifyRSSI(point.rssi);

  const marker = document.createElement('div');
  marker.id          = `marker-${point.id}`;
  marker.className   = `map-marker ${className}`;
  marker.dataset.id  = point.id;
  marker.title       = `${point.name} | ${point.rssi} dBm (${label})`;

  marker.style.left = `${point.x_percent}%`;
  marker.style.top  = `${point.y_percent}%`;

  // Ícono SVG dentro del marcador
  marker.innerHTML = `
    <svg viewBox="0 0 24 24" fill="${color}" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
      <circle cx="12" cy="9" r="2.5" fill="white"/>
    </svg>
    <span class="marker-label">${_truncate(point.name, 14)}</span>
  `;

  // Evento clic
  marker.addEventListener('click', (e) => {
    e.stopPropagation();
    _onPointClick?.(point.id);
  });

  // Drag and drop (solo modo edición)
  _addDragBehavior(marker, point.id);

  _mapContainer.appendChild(marker);
}

// ─────────────────────────────────────────────────────────────
// Privado: drag and drop
// ─────────────────────────────────────────────────────────────

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
    const touch = e.touches[0];
    dragging = true;
    startX   = touch.clientX;
    startY   = touch.clientY;
    origLeft = parseFloat(marker.style.left);
    origTop  = parseFloat(marker.style.top);
    marker.classList.add('dragging');
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend',  onTouchEnd);
  }, { passive: false });

  function onMove(e) {
    if (!dragging) return;
    _moveTo(marker, e.clientX, e.clientY, startX, startY, origLeft, origTop);
  }

  function onTouchMove(e) {
    if (!dragging) return;
    e.preventDefault();
    const touch = e.touches[0];
    _moveTo(marker, touch.clientX, touch.clientY, startX, startY, origLeft, origTop);
  }

  function onUp() {
    _finishDrag(marker, pointId);
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup',   onUp);
    dragging = false;
  }

  function onTouchEnd() {
    _finishDrag(marker, pointId);
    document.removeEventListener('touchmove', onTouchMove);
    document.removeEventListener('touchend',  onTouchEnd);
    dragging = false;
  }
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

  // Actualizar estado interno
  const point = _points.get(pointId);
  if (point) {
    point.x_percent = xPercent;
    point.y_percent = yPercent;
  }

  _onPointMoved?.(pointId, xPercent, yPercent);
}

// ─────────────────────────────────────────────────────────────
// Privado: clic sobre el mapa (crear punto)
// ─────────────────────────────────────────────────────────────

function _handleMapClick(e) {
  if (!_editMode) return;
  // Ignorar clics en marcadores
  if (e.target.closest('.map-marker')) return;

  const rect     = _mapContainer.getBoundingClientRect();
  const xPercent = ((e.clientX - rect.left) / rect.width)  * 100;
  const yPercent = ((e.clientY - rect.top)  / rect.height) * 100;

  _onMapClick?.(
    parseFloat(xPercent.toFixed(3)),
    parseFloat(yPercent.toFixed(3))
  );
}

// ─────────────────────────────────────────────────────────────
// Privado: utilidades
// ─────────────────────────────────────────────────────────────

function _clearMarkers() {
  document.querySelectorAll('.map-marker').forEach(el => el.remove());
}

function _truncate(text, maxLen) {
  return text.length > maxLen ? text.substring(0, maxLen) + '…' : text;
}
