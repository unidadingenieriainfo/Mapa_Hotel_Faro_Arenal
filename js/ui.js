// ============================================================
// js/ui.js — Renderizado de interfaz
// Integra:
//   - Modales y panel de detalle (Mapa_Hotel_Faro_Arenal)
//   - Visor de galería con hero + thumbnails + lightbox (map_Faro_Arenal)
//   - Lista de puntos en sidebar (map_Faro_Arenal)
//   - Tabla resumen y stats (Mapa_Hotel_Faro_Arenal)
// ============================================================

import { classifyRSSI } from './points.js';

// ── Estado del visor de galería ──────────────────────────────
let _viewerPhotos  = [];
let _viewerPhotoIdx = 0;
let _viewerPoint   = null;
let _viewerEditMode = false;
let _viewerCallbacks = {};

// ── Estado del lightbox ──────────────────────────────────────
let _lbPhotos = [];
let _lbIdx    = 0;

// ── Estado de fotos pendientes en modal crear/editar ─────────
let _pendingPhotos = [];  // Array de { src: base64|url, file: File|null }

// ── Punto activo en la lista del sidebar ─────────────────────
let _activePointId = null;

// ════════════════════════════════════════════════════════════
// TOASTS
// ════════════════════════════════════════════════════════════

export function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className  = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('toast-show'));

  setTimeout(() => {
    toast.classList.remove('toast-show');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, 3500);
}

// ════════════════════════════════════════════════════════════
// AUTH UI
// ════════════════════════════════════════════════════════════

export function updateAuthUI(user) {
  const userInfo  = document.getElementById('user-info');
  const btnLogin  = document.getElementById('btn-login');
  const btnLogout = document.getElementById('btn-logout');
  const btnEdit   = document.getElementById('btn-toggle-edit');

  if (user) {
    userInfo.textContent   = user.email;
    userInfo.style.display = '';
    btnLogin.style.display  = 'none';
    btnLogout.style.display = '';
    btnEdit.style.display   = '';
  } else {
    userInfo.textContent    = '';
    userInfo.style.display  = 'none';
    btnLogin.style.display  = '';
    btnLogout.style.display = 'none';
    btnEdit.style.display   = 'none';
  }
}

export function updateEditModeButton(isEditMode) {
  const btn   = document.getElementById('btn-toggle-edit');
  const badge = document.getElementById('edit-mode-badge');
  if (btn) {
    btn.textContent = isEditMode ? '👁 Modo Vista' : '✏️ Modo Edición';
    btn.classList.toggle('btn-active', isEditMode);
  }
  if (badge) badge.style.display = isEditMode ? '' : 'none';
  isEditMode ? _showEditHint() : _hideEditHint();
}

function _showEditHint() {
  let hint = document.getElementById('edit-mode-hint');
  if (!hint) {
    hint = document.createElement('div');
    hint.id = 'edit-mode-hint';
    hint.innerHTML = `
      <span class="edit-hint-icon">✏️</span>
      <div class="edit-hint-text">
        <strong>Modo Edición activo</strong>
        <span>Clic en el mapa para agregar un punto WiFi</span>
      </div>
      <button class="edit-hint-close" id="edit-hint-close-btn">✕</button>
    `;
    document.getElementById('map-area')?.appendChild(hint);
    document.getElementById('edit-hint-close-btn')?.addEventListener('click', () => hint.classList.add('hint-dismissed'));
  }
  hint.classList.remove('hint-dismissed', 'hint-hidden');
}

function _hideEditHint() {
  document.getElementById('edit-mode-hint')?.classList.add('hint-hidden');
}

// ════════════════════════════════════════════════════════════
// MODAL LOGIN
// ════════════════════════════════════════════════════════════

export function openLoginModal() {
  document.getElementById('modal-login').classList.add('modal-open');
  document.getElementById('login-email')?.focus();
}
export function closeLoginModal() {
  document.getElementById('modal-login').classList.remove('modal-open');
  document.getElementById('login-error').textContent = '';
}
export function setLoginError(msg)   { document.getElementById('login-error').textContent = msg; }
export function setLoginLoading(on) {
  const btn = document.getElementById('btn-login-submit');
  btn.disabled    = on;
  btn.textContent = on ? 'Ingresando…' : 'Ingresar';
}

// ════════════════════════════════════════════════════════════
// MODAL CREAR PUNTO — multi-foto (de map_Faro_Arenal)
// ════════════════════════════════════════════════════════════

export function openCreatePointModal(xPercent, yPercent) {
  const modal = document.getElementById('modal-create-point');
  modal.classList.add('modal-open');

  document.getElementById('cp-coords').textContent =
    `Posición: X ${xPercent.toFixed(1)}% · Y ${yPercent.toFixed(1)}%`;

  // Limpiar form
  ['cp-name','cp-cabinet','cp-room','cp-zone','cp-rssi','cp-notes']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.getElementById('cp-error').textContent = '';

  _pendingPhotos = [];
  _renderPhotoGrid('cp-photo-grid', 'cp-photo-count-badge', 'cp-photo-input');

  setTimeout(() => document.getElementById('cp-name')?.focus(), 80);
}

export function closeCreatePointModal() {
  document.getElementById('modal-create-point').classList.remove('modal-open');
  _pendingPhotos = [];
}

/** Retorna los archivos File pendientes del modal de creación */
export function getPendingPhotoFiles() {
  return _pendingPhotos.map(p => p.file).filter(Boolean);
}

/** Inicializa el input de fotos del modal de creación */
export function initCreatePhotoInput() {
  const input = document.getElementById('cp-photo-input');
  if (!input) return;
  input.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    let done = 0;
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        _pendingPhotos.push({ src: ev.target.result, file });
        if (++done === files.length) {
          _renderPhotoGrid('cp-photo-grid', 'cp-photo-count-badge', 'cp-photo-input');
        }
      };
      reader.readAsDataURL(file);
    });
    input.value = '';
  });
}

/** Renderiza la grilla de fotos (de map_Faro_Arenal) */
function _renderPhotoGrid(gridId, badgeId, inputId) {
  const grid  = document.getElementById(gridId);
  const badge = document.getElementById(badgeId);
  if (!grid) return;

  grid.innerHTML = '';
  _pendingPhotos.forEach((photo, i) => {
    const item = document.createElement('div');
    item.className = 'photo-thumb-item';
    const img = document.createElement('img');
    img.src = photo.src;
    img.addEventListener('click', () => _openLightbox([photo.src], 0));
    const del = document.createElement('button');
    del.className   = 'photo-thumb-delete';
    del.textContent = '✕';
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      _pendingPhotos.splice(i, 1);
      _renderPhotoGrid(gridId, badgeId, inputId);
    });
    item.append(img, del);
    grid.appendChild(item);
  });

  // Botón "Agregar"
  const addBtn = document.createElement('button');
  addBtn.type      = 'button';
  addBtn.className = 'photo-add-btn';
  addBtn.innerHTML = '<span class="photo-add-icon">📷</span><span>Agregar</span>';
  addBtn.addEventListener('click', () => document.getElementById(inputId)?.click());
  grid.appendChild(addBtn);

  if (badge) badge.textContent = _pendingPhotos.length ? `(${_pendingPhotos.length})` : '';
}

// ════════════════════════════════════════════════════════════
// VISOR DE PUNTO — galería completa (de map_Faro_Arenal)
// Muestra: datos técnicos + hero de foto + thumbnails
// ════════════════════════════════════════════════════════════

/**
 * Abre el visor de punto con galería de fotos.
 * @param {Object}   point       Punto normalizado (con photos[])
 * @param {boolean}  editMode    ¿Está en modo edición?
 * @param {Object}   callbacks   { onEdit(pointId) }
 */
export function openPointViewer(point, editMode, callbacks = {}) {
  _viewerPoint     = point;
  _viewerEditMode  = editMode;
  _viewerCallbacks = callbacks;
  _viewerPhotos    = point.photos ?? [];
  _viewerPhotoIdx  = 0;

  const { label, color } = classifyRSSI(point.rssi);

  // ── Header
  const rssiEl = document.getElementById('viewer-rssi-badge');
  if (rssiEl) {
    rssiEl.style.background = color;
    rssiEl.innerHTML = `<span>${point.rssi} dBm</span><span style="font-size:.65rem;font-weight:400;opacity:.9">${label}</span>`;
  }
  document.getElementById('viewer-title').textContent = point.label;
  document.getElementById('viewer-meta').textContent  = _buildViewerMeta(point);

  // ── Botón editar (solo en modo edición autenticado)
  const editBtn = document.getElementById('viewer-edit-btn');
  if (editBtn) {
    editBtn.style.display = editMode ? '' : 'none';
    editBtn.onclick = () => { closePointViewer(); callbacks.onEdit?.(point.id); };
  }

  // ── Body
  _renderViewerBody();

  document.getElementById('viewer-overlay').classList.add('viewer-open');
}

function _buildViewerMeta(point) {
  const parts = [];
  if (point.cabinet) parts.push(`Gabinete: ${point.cabinet}`);
  if (point.port)    parts.push(`${point.port}`);
  if (point.description)    parts.push(point.description);
  const photosCount = point.photos?.length ?? 0;
  parts.push(`${photosCount} foto${photosCount !== 1 ? 's' : ''}`);
  return parts.join(' · ');
}

function _renderViewerBody() {
  const body = document.getElementById('viewer-body');
  if (!body) return;
  body.innerHTML = '';

  // Datos técnicos
  const { label, color } = classifyRSSI(_viewerPoint.rssi);
  const dataGrid = document.createElement('div');
  dataGrid.className = 'viewer-data-grid';
  const fields = [
    ['RSSI', `<span class="rssi-badge" style="background:${color}">${_viewerPoint.rssi} dBm</span> <span class="rssi-quality">${label}</span>`],
    _viewerPoint.cabinet  ? ['Gabinete',   _esc(_viewerPoint.cabinet)]  : null,
    _viewerPoint.port     ? ['Puerto', _esc(_viewerPoint.port)]      : null,
    _viewerPoint.description     ? ['Zona',       _esc(_viewerPoint.description)]      : null,
    [`Posición`, `X: ${parseFloat(_viewerPoint.x_pct).toFixed(2)}% · Y: ${parseFloat(_viewerPoint.y_pct).toFixed(2)}%`],
  ].filter(Boolean);

  fields.forEach(([lbl, val]) => {
    const l = document.createElement('span'); l.className = 'viewer-data-label'; l.textContent = lbl;
    const v = document.createElement('span'); v.className = 'viewer-data-value'; v.innerHTML = val;
    dataGrid.append(l, v);
  });
  body.appendChild(dataGrid);

  // Notas
  if (_viewerPoint.description) {
    const notesEl = document.createElement('div');
    notesEl.className = 'viewer-notes';
    notesEl.textContent = _viewerPoint.description;
    body.appendChild(notesEl);
  }

  // Galería de fotos
  if (_viewerPhotos.length === 0) {
    const noPhoto = document.createElement('div');
    noPhoto.className = 'viewer-no-photos';
    noPhoto.innerHTML = '<span class="np-icon">📷</span>Este punto no tiene fotos adjuntas.<br><small>Edítalo en modo edición para agregar imágenes.</small>';
    body.appendChild(noPhoto);
  } else {
    // Cabecera de galería
    const galleryHdr = document.createElement('div');
    galleryHdr.className = 'viewer-gallery-header';
    galleryHdr.innerHTML = `
      <span class="viewer-gallery-label">📷 Fotografías</span>
      <span class="gallery-count">${_viewerPhotos.length}</span>
    `;
    body.appendChild(galleryHdr);

    // Hero
    const hero = document.createElement('div');
    hero.className = 'viewer-hero';
    const heroImg = document.createElement('img');
    heroImg.id  = 'v-hero-img';
    heroImg.src = _viewerPhotos[0];
    heroImg.alt = 'Foto del punto WiFi';
    heroImg.addEventListener('click', () => _openLightbox(_viewerPhotos, _viewerPhotoIdx));

    const navDiv = document.createElement('div');
    navDiv.className = 'viewer-hero-nav';
    const btnPrev = document.createElement('button');
    btnPrev.className = 'hero-nav-btn'; btnPrev.id = 'v-prev'; btnPrev.innerHTML = '&#8249;';
    const btnNext = document.createElement('button');
    btnNext.className = 'hero-nav-btn'; btnNext.id = 'v-next'; btnNext.innerHTML = '&#8250;';
    navDiv.append(btnPrev, btnNext);

    const counter = document.createElement('div');
    counter.className = 'viewer-hero-counter'; counter.id = 'v-counter';

    hero.append(heroImg, navDiv, counter);
    body.appendChild(hero);

    // Thumbnails
    const thumbsDiv = document.createElement('div');
    thumbsDiv.className = 'viewer-thumbs'; thumbsDiv.id = 'v-thumbs';
    body.appendChild(thumbsDiv);

    _updateViewerPhoto(0);

    btnPrev.addEventListener('click', (e) => { e.stopPropagation(); _updateViewerPhoto(_viewerPhotoIdx - 1); });
    btnNext.addEventListener('click', (e) => { e.stopPropagation(); _updateViewerPhoto(_viewerPhotoIdx + 1); });
  }
}

function _updateViewerPhoto(idx) {
  _viewerPhotoIdx = Math.max(0, Math.min(idx, _viewerPhotos.length - 1));

  const heroImg = document.getElementById('v-hero-img');
  if (heroImg) heroImg.src = _viewerPhotos[_viewerPhotoIdx];

  const counter = document.getElementById('v-counter');
  if (counter) counter.textContent = `${_viewerPhotoIdx + 1} / ${_viewerPhotos.length}`;

  const prevBtn = document.getElementById('v-prev');
  const nextBtn = document.getElementById('v-next');
  if (prevBtn) prevBtn.disabled = _viewerPhotoIdx === 0;
  if (nextBtn) nextBtn.disabled = _viewerPhotoIdx === _viewerPhotos.length - 1;

  const thumbsDiv = document.getElementById('v-thumbs');
  if (thumbsDiv) {
    thumbsDiv.innerHTML = '';
    _viewerPhotos.forEach((src, i) => {
      const th = document.createElement('div');
      th.className = 'viewer-thumb' + (i === _viewerPhotoIdx ? ' selected' : '');
      const img = document.createElement('img'); img.src = src; img.alt = `Foto ${i + 1}`;
      th.appendChild(img);
      th.addEventListener('click', () => _updateViewerPhoto(i));
      thumbsDiv.appendChild(th);
    });
  }
}

export function closePointViewer() {
  document.getElementById('viewer-overlay')?.classList.remove('viewer-open');
  _viewerPoint    = null;
  _viewerPhotos   = [];
}

// Configurar botones de cierre del visor
export function initViewerEvents() {
  document.getElementById('viewer-close')?.addEventListener('click', closePointViewer);
  document.getElementById('viewer-close-btn')?.addEventListener('click', closePointViewer);
  document.getElementById('viewer-overlay')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closePointViewer();
  });

  // Teclado: flechas para navegar fotos, Escape para cerrar
  document.addEventListener('keydown', (e) => {
    const viewerOpen = document.getElementById('viewer-overlay')?.classList.contains('viewer-open');
    const lbOpen     = document.getElementById('app-lightbox')?.classList.contains('lb-open');

    if (e.key === 'Escape') {
      if (lbOpen)     { closeLightbox(); return; }
      if (viewerOpen) { closePointViewer(); return; }
    }
    if (viewerOpen && _viewerPhotos.length > 1) {
      if (e.key === 'ArrowRight') _updateViewerPhoto(_viewerPhotoIdx + 1);
      if (e.key === 'ArrowLeft')  _updateViewerPhoto(_viewerPhotoIdx - 1);
    }
    if (lbOpen && _lbPhotos.length > 1) {
      if (e.key === 'ArrowRight' && _lbIdx < _lbPhotos.length - 1) { _lbIdx++; _updateLightbox(); }
      if (e.key === 'ArrowLeft'  && _lbIdx > 0)                     { _lbIdx--; _updateLightbox(); }
    }
  });
}

// ════════════════════════════════════════════════════════════
// LIGHTBOX
// ════════════════════════════════════════════════════════════

function _openLightbox(photos, idx) {
  _lbPhotos = photos;
  _lbIdx    = idx;
  document.getElementById('app-lightbox').classList.add('lb-open');
  _updateLightbox();
}

function _updateLightbox() {
  const img = document.getElementById('lb-img');
  if (img) img.src = _lbPhotos[_lbIdx];

  const prev    = document.getElementById('lb-prev');
  const next    = document.getElementById('lb-next');
  const counter = document.getElementById('lb-counter');

  if (prev) prev.disabled = _lbIdx === 0;
  if (next) next.disabled = _lbIdx === _lbPhotos.length - 1;
  const multi = _lbPhotos.length > 1;
  if (prev) prev.style.display = multi ? '' : 'none';
  if (next) next.style.display = multi ? '' : 'none';
  if (counter) counter.textContent = multi ? `${_lbIdx + 1} / ${_lbPhotos.length}` : '';
}

export function closeLightbox() {
  document.getElementById('app-lightbox')?.classList.remove('lb-open');
}

export function initLightboxEvents() {
  const lb = document.getElementById('app-lightbox');
  lb?.addEventListener('click', (e) => { if (e.target === lb || e.target.id === 'lb-img') closeLightbox(); });
  document.getElementById('lb-close')?.addEventListener('click', closeLightbox);
  document.getElementById('lb-prev')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (_lbIdx > 0) { _lbIdx--; _updateLightbox(); }
  });
  document.getElementById('lb-next')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (_lbIdx < _lbPhotos.length - 1) { _lbIdx++; _updateLightbox(); }
  });
}

// ════════════════════════════════════════════════════════════
// PANEL LATERAL DE DETALLE / EDICIÓN
// ════════════════════════════════════════════════════════════

export function openDetailPanel(point, editMode, callbacks) {
  const panel = document.getElementById('detail-panel');
  const { label, color } = classifyRSSI(point.rssi);

  panel.innerHTML = editMode
    ? _buildEditPanelHTML(point, label, color)
    : _buildViewPanelHTML(point, label, color);
  panel.classList.add('panel-open');

  if (editMode) {
    _bindEditPanelEvents(panel, point, callbacks);
  } else {
    // En modo vista, clic en la foto abre el visor
    panel.querySelector('.detail-photo-hero')?.addEventListener('click', () => {
      openPointViewer(point, false);
    });
  }
}

export function closeDetailPanel() {
  document.getElementById('detail-panel')?.classList.remove('panel-open');
}

function _buildViewPanelHTML(point, qualityLabel, color) {
  const photos = point.photos ?? [];
  const photoSection = photos.length
    ? `<div class="detail-photo-hero">
         <img src="${photos[0]}" alt="Foto del punto" loading="lazy" />
         <span class="detail-zoom-hint">${photos.length > 1 ? `📷 ${photos.length} fotos — clic para ver` : '🔍 Clic para ampliar'}</span>
       </div>`
    : `<div class="detail-no-photo">📷 Sin fotografía registrada</div>`;

  return `
    <div class="panel-header">
      <h3>${_esc(point.label)}</h3>
      <button class="btn-close-panel" onclick="window._closePanel()">✕</button>
    </div>
    <div class="panel-body">
      ${photoSection}
      <div class="detail-grid">
        <span class="detail-label">Gabinete</span>
        <span class="detail-value">${_esc(point.cabinet || '—')}</span>
        <span class="detail-label">Habitación</span>
        <span class="detail-value">${_esc(point.port || '—')}</span>
        <span class="detail-label">Zona</span>
        <span class="detail-value">${_esc(point.description || '—')}</span>
        <span class="detail-label">RSSI</span>
        <span class="detail-value">
          <span class="rssi-badge" style="background:${color}">${point.rssi} dBm</span>
          <span class="rssi-quality">${qualityLabel}</span>
        </span>
        ${point.description ? `<span class="detail-label">Notas</span><span class="detail-value">${_esc(point.description)}</span>` : ''}
      </div>
      <div class="detail-coords">📍 X: ${parseFloat(point.x_pct).toFixed(2)}% · Y: ${parseFloat(point.y_pct).toFixed(2)}%</div>
    </div>`;
}

function _buildEditPanelHTML(point, qualityLabel, color) {
  const photos = point.photos ?? [];
  const photoSection = photos.length
    ? `<div class="detail-photo-hero"><img class="dp-hero-img" src="${photos[0]}" alt="Foto" loading="lazy" /></div>`
    : `<div class="detail-no-photo">📷 Sin fotografía registrada</div>`;

  return `
    <div class="panel-header">
      <h3>Editar Punto</h3>
      <button class="btn-close-panel" onclick="window._closePanel()">✕</button>
    </div>
    <div class="panel-body">
      ${photoSection}
      <div class="form-group">
        <label>📷 Cambiar foto principal</label>
        <input type="file" id="dp-photo" accept="image/jpeg,image/png,image/webp" />
        <span id="dp-photo-status" class="field-hint"></span>
      </div>
      <div class="form-group">
        <label>Nombre <span class="req">*</span></label>
        <input type="text" id="dp-label" value="${_esc(point.label)}" maxlength="80" required />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Gabinete</label>
          <input type="text" id="dp-cabinet" value="${_esc(point.cabinet || '')}" maxlength="50" />
        </div>
        <div class="form-group">
          <label>Puerto</label>
          <input type="text" id="dp-port" value="${_esc(point.port || '')}" maxlength="50" />
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>RSSI (dBm) <span class="req">*</span></label>
          <input type="number" id="dp-rssi" value="${point.rssi}" min="-100" max="0" required />
        </div>
      </div>
      <div class="form-group">
        <label>Descripción / Notas</label>
        <textarea id="dp-description" rows="3" maxlength="500">${_esc(point.description || '')}</textarea>
      </div>
      <p id="dp-error" class="form-error"></p>
      <div class="panel-actions">
        <button id="dp-btn-save"   class="btn btn-primary">💾 Guardar</button>
        <button id="dp-btn-delete" class="btn btn-danger">🗑 Eliminar</button>
      </div>
    </div>`;
}

function _bindEditPanelEvents(panel, point, { onSave, onDelete, onPhotoUpload }) {
  const btnSave   = panel.querySelector('#dp-btn-save');
  const btnDelete = panel.querySelector('#dp-btn-delete');
  const errorEl   = panel.querySelector('#dp-error');
  const photoIn   = panel.querySelector('#dp-photo');
  const statusEl  = panel.querySelector('#dp-photo-status');

  photoIn?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    if (statusEl) statusEl.textContent = '⏳ Subiendo foto…';
    const result = await onPhotoUpload(file, point.id);
    if (statusEl) statusEl.textContent = result.error ? '❌ Error al subir' : '✅ Foto actualizada';
    if (!result.error) {
      const hero = panel.querySelector('.dp-hero-img');
      if (hero && result.url) hero.src = result.url;
    }
  });

  btnSave?.addEventListener('click', async () => {
    const name = panel.querySelector('#dp-label')?.value.trim();
    const rssi = parseInt(panel.querySelector('#dp-rssi')?.value);
    if (!name) { errorEl.textContent = 'El nombre es obligatorio.'; return; }
    if (isNaN(rssi) || rssi < -100 || rssi > 0) { errorEl.textContent = 'RSSI debe estar entre −100 y 0.'; return; }
    errorEl.textContent = '';
    btnSave.disabled = true; btnSave.textContent = 'Guardando…';
    await onSave(point.id, {
      label:       name,
      rssi,
      cabinet:     panel.querySelector('#dp-cabinet')?.value.trim()     || null,
      port:        panel.querySelector('#dp-port')?.value.trim()        || null,
      description: panel.querySelector('#dp-description')?.value.trim() || null,
    });
    btnSave.disabled = false; btnSave.textContent = '💾 Guardar';
  });

  btnDelete?.addEventListener('click', async () => {
    if (!confirm(`¿Eliminar el punto "${point.label}"? Esta acción no se puede deshacer.`)) return;
    await onDelete(point.id, point.photo_path ?? null);
    closeDetailPanel();
  });
}

// ════════════════════════════════════════════════════════════
// LISTA DE PUNTOS EN SIDEBAR (de map_Faro_Arenal)
// ════════════════════════════════════════════════════════════

/**
 * Renderiza la lista de puntos en el sidebar.
 * @param {Array}    points
 * @param {Function} onClick  Callback(pointId)
 */
export function renderPointList(points, onClick) {
  const container = document.getElementById('point-list');
  if (!container) return;

  if (!points.length) {
    container.innerHTML = '<div class="point-list-empty">No hay puntos registrados.</div>';
    return;
  }

  container.innerHTML = '';
  points.forEach(point => {
    const { color } = classifyRSSI(point.rssi);
    const item = document.createElement('div');
    item.className = `point-list-item${point.id === _activePointId ? ' pli-active' : ''}`;
    item.dataset.pointId = point.id;

    item.innerHTML = `
      <span class="point-list-dot" style="background:${color}"></span>
      <div class="point-list-info">
        <div class="point-list-name" title="${_esc(point.label)}">${_esc(_truncate(point.label, 22))}</div>
        <div class="point-list-sub">${_esc(point.port || point.description || point.cabinet || '—')}</div>
      </div>
      <span class="point-list-rssi" style="background:${color}">${point.rssi}</span>
    `;

    item.addEventListener('click', () => {
      _activePointId = point.id;
      // Actualizar clase activa
      container.querySelectorAll('.point-list-item').forEach(el => el.classList.remove('pli-active'));
      item.classList.add('pli-active');
      onClick(point.id);
    });

    container.appendChild(item);
  });
}

export function setActivePointInList(pointId) {
  _activePointId = pointId;
  document.querySelectorAll('.point-list-item').forEach(el => {
    el.classList.toggle('pli-active', el.dataset.pointId === pointId);
  });
}

// ════════════════════════════════════════════════════════════
// FILTROS
// ════════════════════════════════════════════════════════════

export function populateCabinetFilter(points) {
  const select = document.getElementById('filter-cabinet');
  if (!select) return;
  const cabinets = [...new Set(points.map(p => p.cabinet).filter(Boolean))].sort();
  const current  = select.value;
  select.innerHTML = '<option value="">— Todos —</option>';
  cabinets.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c; opt.textContent = c;
    if (c === current) opt.selected = true;
    select.appendChild(opt);
  });
}

// ════════════════════════════════════════════════════════════
// TABLA RESUMEN
// ════════════════════════════════════════════════════════════

export function renderSummaryTable(points) {
  const tbody = document.getElementById('summary-tbody');
  if (!tbody) return;

  if (!points.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="table-empty">No hay puntos registrados.</td></tr>`;
    updateStatCounters([]);
    return;
  }

  tbody.innerHTML = points.map(p => {
    const { label, color } = classifyRSSI(p.rssi);
    const photosCount = p.photos?.length ?? 0;
    return `
      <tr class="table-row" data-id="${p.id}">
        <td>${_esc(p.name)}</td>
        <td>${_esc(p.cabinet || '—')}</td>
        <td>${_esc(p.port    || '—')}</td>
        <td>${_esc(p.description    || '—')}</td>
        <td><span class="rssi-badge" style="background:${color}">${p.rssi} dBm</span></td>
        <td><span class="quality-label" style="color:${color};font-weight:600">${label}</span></td>
        <td>${photosCount ? `📷 ${photosCount}` : '—'}</td>
      </tr>`;
  }).join('');

  updateStatCounters(points);
}

export function updateStatCounters(points) {
  const total     = points.length;
  const excellent = points.filter(p => p.rssi >= -55).length;
  const good      = points.filter(p => p.rssi >= -70 && p.rssi < -55).length;
  const fair      = points.filter(p => p.rssi >= -75 && p.rssi < -70).length;
  const poor      = points.filter(p => p.rssi < -75).length;
  _setEl('stat-total',     total);
  _setEl('stat-excellent', excellent);
  _setEl('stat-good',      good);
  _setEl('stat-fair',      fair);
  _setEl('stat-poor',      poor);
}

// ════════════════════════════════════════════════════════════
// LOADER
// ════════════════════════════════════════════════════════════

export function showLoader(message = 'Cargando…') {
  const loader = document.getElementById('app-loader');
  if (loader) {
    loader.querySelector('.loader-text').textContent = message;
    loader.style.display = 'flex';
  }
}

export function hideLoader() {
  const loader = document.getElementById('app-loader');
  if (loader) loader.style.display = 'none';
}

// ════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════

function _esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function _setEl(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}
function _truncate(text, maxLen) {
  return text.length > maxLen ? text.substring(0, maxLen) + '…' : text;
}

// Cerrar panel desde HTML (onclick global)
window._closePanel = () => closeDetailPanel();
