// ============================================================
// js/map.js — Mapa interactivo
// Campos del punto: label, x_pct, y_pct, rssi, cabinet, port, description, photos
// ============================================================

import { classifyRSSI } from './points.js';

// ── Estado interno ───────────────────────────────────────────
let _container    = null;   // #map-container
let _tooltip      = null;   // #map-tooltip
let _editMode     = false;

let _onMarkerClick = null;
let _onMapClick    = null;
let _onPointMoved  = null;

const _points = new Map(); // id → pointData

// ── Init ─────────────────────────────────────────────────────

export function initMap({ onMarkerClick, onMapClick, onPointMoved } = {}) {
  _container     = document.getElementById('map-container');
  _tooltip       = document.getElementById('map-tooltip');
  _onMarkerClick = onMarkerClick ?? null;
  _onMapClick    = onMapClick    ?? null;
  _onPointMoved  = onPointMoved  ?? null;

  if (!_container) { console.error('[map] #map-container no encontrado'); return; }

  _container.addEventListener('click', _handleContainerClick);
}

// ── Modo edición ─────────────────────────────────────────────

export function setEditMode(active) {
  _editMode = active;
  if (_container) _container.style.cursor = active ? 'crosshair' : 'default';
}

// ── Renderizado ───────────────────────────────────────────────

export function renderPoints(points) {
  document.querySelectorAll('.map-marker').forEach(el => el.remove());
  _points.clear();
  points.forEach(p => { _points.set(p.id, p); _createMarker(p); });
}

export function upsertMarker(point) {
  _points.set(point.id, point);
  document.getElementById(`marker-${point.id}`)?.remove();
  _createMarker(point);
}

export function removeMarker(pointId) {
  document.getElementById(`marker-${pointId}`)?.remove();
  _points.delete(pointId);
}

// ── Filtros ───────────────────────────────────────────────────
// rssi puede ser 'all' | 'rssi-excellent' | 'rssi-good' | 'rssi-fair' | 'rssi-poor'

export function applyFilters({ cabinet = 'all', rssi = 'all' } = {}) {
  _points.forEach((point, id) => {
    const el = document.getElementById(`marker-${id}`);
    if (!el) return;
    const { className } = classifyRSSI(point.rssi);
    const okCabinet = cabinet === 'all' || point.cabinet === cabinet;
    const okRssi    = rssi    === 'all' || className     === rssi;
    el.style.display = (okCabinet && okRssi) ? '' : 'none';
  });
}

// ── Crear marcador ────────────────────────────────────────────

function _createMarker(point) {
  if (!_container) return;
  const { className, color, label: qualityLabel } = classifyRSSI(point.rssi);

  const marker = document.createElement('div');
  marker.id         = `marker-${point.id}`;
  marker.className  = `map-marker ${className}`;
  marker.dataset.id = point.id;
  marker.style.left = `${point.x_pct}%`;
  marker.style.top  = `${point.y_pct}%`;

  const circle  = document.createElement('div');
  circle.className = 'marker-circle';

  const labelEl = document.createElement('div');
  labelEl.className   = 'marker-label';
  labelEl.textContent = _truncate(point.label ?? '', 14);

  marker.append(circle, labelEl);

  marker.addEventListener('mouseenter', () => { _showTooltip(point, marker, qualityLabel, color); marker.classList.add('active'); });
  marker.addEventListener('mouseleave', () => { _hideTooltip(); marker.classList.remove('active'); });
  marker.addEventListener('click', e => { e.stopPropagation(); _onMarkerClick?.(point.id); });

  _addDrag(marker, point.id);
  _container.appendChild(marker);
}

// ── Tooltip ───────────────────────────────────────────────────

function _showTooltip(point, markerEl, qualityLabel, color) {
  if (!_tooltip) return;
  const photosCount = point.photos?.length ?? 0;

  _tooltip.innerHTML = `
    <div class="tt-header">
      <span class="tt-name">${_esc(point.label)}</span>
      <span class="tt-badge" style="background:${color}">${point.rssi} dBm</span>
    </div>
    <div class="tt-body">
      <div class="tt-row"><span>Calidad</span><span style="color:${color};font-weight:600">${qualityLabel}</span></div>
      ${point.cabinet     ? `<div class="tt-row"><span>Gabinete</span><span>${_esc(point.cabinet)}</span></div>` : ''}
      ${point.port        ? `<div class="tt-row"><span>Puerto</span><span>${_esc(point.port)}</span></div>` : ''}
      ${point.description ? `<div class="tt-row"><span>Nota</span><span>${_esc(_truncate(point.description,40))}</span></div>` : ''}
    </div>
    ${photosCount ? `<div class="tt-photos">📷 ${photosCount} foto${photosCount !== 1 ? 's' : ''}</div>` : ''}
  `;
  _tooltip.classList.add('tt-visible');

  const cR = _container.getBoundingClientRect();
  const mR = markerEl.getBoundingClientRect();
  const ttW = 240;
  const ttH = _tooltip.offsetHeight || 120;

  let left = mR.left - cR.left + mR.width / 2 - ttW / 2;
  let top  = mR.top  - cR.top  - ttH - 14;
  left = Math.max(8, Math.min(left, cR.width - ttW - 8));
  if (top < 8) top = mR.bottom - cR.top + 8;

  _tooltip.style.cssText += `left:${left}px;top:${top}px;width:${ttW}px;`;
}

function _hideTooltip() { _tooltip?.classList.remove('tt-visible'); }

// ── Drag & drop ───────────────────────────────────────────────

function _addDrag(marker, pointId) {
  let dragging = false, sx, sy, ox, oy;

  const start = (cx, cy) => {
    if (!_editMode) return false;
    dragging = true;
    sx = cx; sy = cy;
    ox = parseFloat(marker.style.left);
    oy = parseFloat(marker.style.top);
    marker.classList.add('dragging');
    return true;
  };

  const move = (cx, cy) => {
    if (!dragging) return;
    const r  = _container.getBoundingClientRect();
    const nl = Math.max(0, Math.min(100, ox + (cx - sx) / r.width  * 100));
    const nt = Math.max(0, Math.min(100, oy + (cy - sy) / r.height * 100));
    marker.style.left = `${nl}%`;
    marker.style.top  = `${nt}%`;
  };

  const end = () => {
    if (!dragging) return;
    dragging = false;
    marker.classList.remove('dragging');
    const xp = parseFloat(marker.style.left);
    const yp = parseFloat(marker.style.top);
    const p  = _points.get(pointId);
    if (p) { p.x_pct = xp; p.y_pct = yp; }
    _onPointMoved?.(pointId, xp, yp);
  };

  marker.addEventListener('mousedown', e => { if (!_editMode) return; e.preventDefault(); e.stopPropagation(); if (!start(e.clientX, e.clientY)) return; const mm = ev => move(ev.clientX, ev.clientY); const mu = () => { end(); document.removeEventListener('mousemove', mm); document.removeEventListener('mouseup', mu); }; document.addEventListener('mousemove', mm); document.addEventListener('mouseup', mu); });

  marker.addEventListener('touchstart', e => { if (!_editMode) return; e.preventDefault(); const t = e.touches[0]; if (!start(t.clientX, t.clientY)) return; const tm = ev => { ev.preventDefault(); const tt = ev.touches[0]; move(tt.clientX, tt.clientY); }; const te = () => { end(); document.removeEventListener('touchmove', tm); document.removeEventListener('touchend', te); }; document.addEventListener('touchmove', tm, { passive: false }); document.addEventListener('touchend', te); }, { passive: false });
}

// ── Click en área vacía del mapa ──────────────────────────────

function _handleContainerClick(e) {
  if (!_editMode) return;
  if (e.target.closest('.map-marker')) return;
  const r    = _container.getBoundingClientRect();
  const xPct = parseFloat(((e.clientX - r.left) / r.width  * 100).toFixed(3));
  const yPct = parseFloat(((e.clientY - r.top)  / r.height * 100).toFixed(3));
  _onMapClick?.(xPct, yPct);
}

// ── Utilidades ────────────────────────────────────────────────

function _truncate(s, n) { return s.length > n ? s.slice(0, n) + '…' : s; }
function _esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
