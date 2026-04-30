// =============================================================
// js/ui.js — Renderizado de interfaz: modales, panel, tabla, filtros
// =============================================================

import { classifyRSSI } from './points.js';

// ─────────────────────────────────────────────────────────────
// Notificaciones (toast)
// ─────────────────────────────────────────────────────────────

export function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('toast-show'));

  setTimeout(() => {
    toast.classList.remove('toast-show');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, 3500);
}

// ─────────────────────────────────────────────────────────────
// Estado de sesión en el header
// ─────────────────────────────────────────────────────────────

export function updateAuthUI(user) {
  const userInfo  = document.getElementById('user-info');
  const btnLogin  = document.getElementById('btn-login');
  const btnLogout = document.getElementById('btn-logout');
  const btnEdit   = document.getElementById('btn-toggle-edit');

  if (user) {
    userInfo.textContent = user.email;
    userInfo.style.display = '';
    btnLogin.style.display  = 'none';
    btnLogout.style.display = '';
    btnEdit.style.display   = '';
  } else {
    userInfo.textContent = '';
    userInfo.style.display  = 'none';
    btnLogin.style.display  = '';
    btnLogout.style.display = 'none';
    btnEdit.style.display   = 'none';
  }
}

export function updateEditModeButton(isEditMode) {
  const btn = document.getElementById('btn-toggle-edit');
  if (!btn) return;
  btn.textContent = isEditMode ? '👁 Modo Vista' : '✏️ Modo Edición';
  btn.classList.toggle('btn-active', isEditMode);

  const badge = document.getElementById('edit-mode-badge');
  if (badge) badge.style.display = isEditMode ? '' : 'none';

  // Mostrar u ocultar la instrucción flotante
  isEditMode ? _showEditHint() : _hideEditHint();
}

// ─────────────────────────────────────────────────────────────
// Hint flotante "clic en mapa para agregar punto"
// ─────────────────────────────────────────────────────────────

function _showEditHint() {
  let hint = document.getElementById('edit-mode-hint');
  if (!hint) {
    hint = document.createElement('div');
    hint.id = 'edit-mode-hint';
    hint.innerHTML = `
      <span class="edit-hint-icon">✏️</span>
      <div class="edit-hint-text">
        <strong>Modo Edición activo</strong>
        <span>Haz clic sobre el mapa para agregar un punto WiFi</span>
      </div>
      <button class="edit-hint-close" id="edit-hint-close-btn">✕</button>
    `;
    const mapArea = document.getElementById('map-area');
    if (mapArea) mapArea.appendChild(hint);

    document.getElementById('edit-hint-close-btn')?.addEventListener('click', () => {
      hint.classList.add('hint-dismissed');
    });
  }
  hint.classList.remove('hint-dismissed', 'hint-hidden');
}

function _hideEditHint() {
  const hint = document.getElementById('edit-mode-hint');
  if (hint) hint.classList.add('hint-hidden');
}

// ─────────────────────────────────────────────────────────────
// Modal de Login
// ─────────────────────────────────────────────────────────────

export function openLoginModal() {
  document.getElementById('modal-login').classList.add('modal-open');
  document.getElementById('login-email').focus();
}

export function closeLoginModal() {
  document.getElementById('modal-login').classList.remove('modal-open');
  document.getElementById('login-error').textContent = '';
}

export function setLoginError(message) {
  document.getElementById('login-error').textContent = message;
}

export function setLoginLoading(loading) {
  const btn = document.getElementById('btn-login-submit');
  btn.disabled    = loading;
  btn.textContent = loading ? 'Ingresando…' : 'Ingresar';
}

// ─────────────────────────────────────────────────────────────
// Modal de Crear Punto — con preview de foto
// ─────────────────────────────────────────────────────────────

export function openCreatePointModal(xPercent, yPercent, onSubmit) {
  const modal = document.getElementById('modal-create-point');
  modal.classList.add('modal-open');

  document.getElementById('cp-coords').textContent =
    `X: ${xPercent.toFixed(1)}% — Y: ${yPercent.toFixed(1)}%`;

  document.getElementById('form-create-point').reset();
  document.getElementById('cp-error').textContent = '';

  // Limpiar preview anterior y reinicializar
  const old = document.getElementById('cp-photo-preview-wrap');
  if (old) old.remove();
  _initCreatePhotoPreview();

  modal._onSubmit = onSubmit;
  modal._xPercent = xPercent;
  modal._yPercent = yPercent;

  setTimeout(() => document.getElementById('cp-name')?.focus(), 80);
}

export function closeCreatePointModal() {
  document.getElementById('modal-create-point').classList.remove('modal-open');
  const prev = document.getElementById('cp-photo-preview-wrap');
  if (prev) prev.remove();
}

function _initCreatePhotoPreview() {
  const photoInput = document.getElementById('cp-photo');
  if (!photoInput) return;

  const wrap = document.createElement('div');
  wrap.id = 'cp-photo-preview-wrap';
  wrap.className = 'cp-photo-preview-wrap hidden';
  wrap.innerHTML = `
    <div class="cp-photo-thumb-wrap">
      <img id="cp-photo-preview-img" src="" alt="Vista previa" />
      <button type="button" id="cp-photo-clear" class="cp-photo-clear" title="Quitar foto">✕</button>
    </div>
    <span class="cp-photo-preview-name" id="cp-photo-preview-name"></span>
  `;
  photoInput.parentNode.insertBefore(wrap, photoInput.nextSibling);

  photoInput.addEventListener('change', function () {
    const file = this.files[0];
    if (!file) { wrap.classList.add('hidden'); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      document.getElementById('cp-photo-preview-img').src = e.target.result;
      document.getElementById('cp-photo-preview-name').textContent = file.name;
      wrap.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
  });

  document.getElementById('cp-photo-clear')?.addEventListener('click', () => {
    photoInput.value = '';
    document.getElementById('cp-photo-preview-img').src = '';
    wrap.classList.add('hidden');
  });
}

// ─────────────────────────────────────────────────────────────
// Lightbox
// ─────────────────────────────────────────────────────────────

export function openLightbox(url) {
  if (!url) return;

  let lb = document.getElementById('app-lightbox');
  if (!lb) {
    lb = document.createElement('div');
    lb.id = 'app-lightbox';
    lb.innerHTML = `
      <button id="lb-close" title="Cerrar (Esc)">✕</button>
      <img id="lb-img" src="" alt="Foto completa" />
    `;
    document.body.appendChild(lb);

    lb.addEventListener('click', (e) => {
      if (e.target === lb || e.target.id === 'lb-img') lb.classList.remove('lb-open');
    });
    document.getElementById('lb-close').addEventListener('click', () => lb.classList.remove('lb-open'));

    // Cerrar con Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && lb.classList.contains('lb-open')) lb.classList.remove('lb-open');
    });
  }

  document.getElementById('lb-img').src = url;
  lb.classList.add('lb-open');
}

// ─────────────────────────────────────────────────────────────
// Panel de Detalle / Edición de Punto
// ─────────────────────────────────────────────────────────────

export function openDetailPanel(point, editMode, callbacks) {
  const panel = document.getElementById('detail-panel');
  const { label, className, color } = classifyRSSI(point.rssi);

  panel.innerHTML = _buildDetailPanelHTML(point, label, color, editMode);
  panel.classList.add('panel-open');

  if (editMode) {
    _bindDetailPanelEvents(panel, point, callbacks);
  } else {
    // Modo vista: foto → lightbox
    const heroImg = panel.querySelector('.detail-hero-img');
    if (heroImg) {
      heroImg.addEventListener('click', () => openLightbox(point.photo_url));
    }
  }
}

export function closeDetailPanel() {
  document.getElementById('detail-panel')?.classList.remove('panel-open');
}

function _buildDetailPanelHTML(point, qualityLabel, qualityColor, editMode) {
  let photoSection;
  if (point.photo_url) {
    photoSection = `
      <div class="detail-photo-hero${editMode ? '' : ' detail-photo-zoomable'}">
        <img class="detail-hero-img" src="${point.photo_url}" alt="Foto del punto" loading="lazy" />
        ${editMode ? '' : '<span class="detail-zoom-hint">🔍 Clic para ampliar</span>'}
      </div>`;
  } else {
    photoSection = `<div class="detail-no-photo">📷 Sin fotografía registrada</div>`;
  }

  if (!editMode) {
    return `
      <div class="panel-header">
        <h3>${_esc(point.name)}</h3>
        <button class="btn-close-panel" onclick="window._closePanel()">✕</button>
      </div>
      <div class="panel-body">
        ${photoSection}
        <div class="detail-grid">
          <span class="detail-label">Gabinete</span>
          <span class="detail-value">${_esc(point.cabinet || '—')}</span>
          <span class="detail-label">Habitación</span>
          <span class="detail-value">${_esc(point.room || '—')}</span>
          <span class="detail-label">Zona</span>
          <span class="detail-value">${_esc(point.zone || '—')}</span>
          <span class="detail-label">RSSI</span>
          <span class="detail-value">
            <span class="rssi-badge" style="background:${qualityColor}">${point.rssi} dBm</span>
            <span class="rssi-quality">${qualityLabel}</span>
          </span>
          ${point.notes ? `
          <span class="detail-label">Notas</span>
          <span class="detail-value">${_esc(point.notes)}</span>` : ''}
        </div>
        <div class="detail-coords">
          📍 X: ${parseFloat(point.x_percent).toFixed(2)}% — Y: ${parseFloat(point.y_percent).toFixed(2)}%
        </div>
      </div>
    `;
  }

  return `
    <div class="panel-header">
      <h3>Editar Punto</h3>
      <button class="btn-close-panel" onclick="window._closePanel()">✕</button>
    </div>
    <div class="panel-body">
      ${photoSection}

      <div class="form-group">
        <label>📷 Cambiar foto</label>
        <input type="file" id="dp-photo" accept="image/jpeg,image/png,image/webp" />
        <div id="dp-photo-preview-wrap" class="cp-photo-preview-wrap hidden">
          <div class="cp-photo-thumb-wrap">
            <img id="dp-photo-preview-img" src="" alt="Preview" />
          </div>
          <span class="cp-photo-preview-name" id="dp-photo-preview-name"></span>
        </div>
        <span id="dp-photo-status" class="field-hint"></span>
      </div>

      <div class="form-group">
        <label>Nombre <span class="req">*</span></label>
        <input type="text" id="dp-name" value="${_esc(point.name)}" maxlength="80" required />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Gabinete</label>
          <input type="text" id="dp-cabinet" value="${_esc(point.cabinet || '')}" maxlength="50" />
        </div>
        <div class="form-group">
          <label>Habitación</label>
          <input type="text" id="dp-room" value="${_esc(point.room || '')}" maxlength="50" />
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Zona</label>
          <input type="text" id="dp-zone" value="${_esc(point.zone || '')}" maxlength="50" />
        </div>
        <div class="form-group">
          <label>RSSI (dBm) <span class="req">*</span></label>
          <input type="number" id="dp-rssi" value="${point.rssi}" min="-100" max="0" required />
        </div>
      </div>
      <div class="form-group">
        <label>Notas</label>
        <textarea id="dp-notes" rows="3" maxlength="500">${_esc(point.notes || '')}</textarea>
      </div>
      <p id="dp-error" class="form-error"></p>
      <div class="panel-actions">
        <button id="dp-btn-save" class="btn btn-primary">💾 Guardar</button>
        <button id="dp-btn-delete" class="btn btn-danger">🗑 Eliminar</button>
      </div>
    </div>
  `;
}

function _bindDetailPanelEvents(panel, point, { onSave, onDelete, onPhotoUpload }) {
  const btnSave    = panel.querySelector('#dp-btn-save');
  const btnDelete  = panel.querySelector('#dp-btn-delete');
  const photoInput = panel.querySelector('#dp-photo');
  const errorEl    = panel.querySelector('#dp-error');

  photoInput?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Preview local
    const reader = new FileReader();
    reader.onload = (ev) => {
      const prevWrap = panel.querySelector('#dp-photo-preview-wrap');
      const prevImg  = panel.querySelector('#dp-photo-preview-img');
      const prevName = panel.querySelector('#dp-photo-preview-name');
      if (prevWrap && prevImg) {
        prevImg.src = ev.target.result;
        if (prevName) prevName.textContent = file.name;
        prevWrap.classList.remove('hidden');
      }
    };
    reader.readAsDataURL(file);

    // Subir
    const statusEl = panel.querySelector('#dp-photo-status');
    if (statusEl) statusEl.textContent = '⏳ Subiendo…';

    const result = await onPhotoUpload(file, point.id);
    if (statusEl) {
      statusEl.textContent = result.error ? '❌ Error al subir' : '✅ Foto actualizada';
    }

    // Actualizar hero si fue exitoso
    if (!result.error) {
      const hero = panel.querySelector('.detail-hero-img');
      const heroWrap = panel.querySelector('.detail-photo-hero');
      if (hero && result.url) {
        hero.src = result.url;
      } else if (heroWrap && result.url) {
        // Era "sin foto", ahora tiene
        heroWrap.outerHTML = `<div class="detail-photo-hero"><img class="detail-hero-img" src="${result.url}" /></div>`;
      }
    }
  });

  btnSave?.addEventListener('click', async () => {
    const name = panel.querySelector('#dp-name')?.value.trim();
    const rssi = parseInt(panel.querySelector('#dp-rssi')?.value);

    if (!name) { errorEl.textContent = 'El nombre es obligatorio.'; return; }
    if (isNaN(rssi) || rssi < -100 || rssi > 0) {
      errorEl.textContent = 'RSSI debe estar entre -100 y 0.'; return;
    }

    errorEl.textContent = '';
    btnSave.disabled    = true;
    btnSave.textContent = 'Guardando…';

    await onSave(point.id, {
      name,
      cabinet: panel.querySelector('#dp-cabinet')?.value.trim() || null,
      room:    panel.querySelector('#dp-room')?.value.trim()    || null,
      zone:    panel.querySelector('#dp-zone')?.value.trim()    || null,
      rssi,
      notes:   panel.querySelector('#dp-notes')?.value.trim()  || null,
    });

    btnSave.disabled    = false;
    btnSave.textContent = '💾 Guardar';
  });

  btnDelete?.addEventListener('click', async () => {
    if (!confirm(`¿Eliminar el punto "${point.name}"? Esta acción no se puede deshacer.`)) return;
    await onDelete(point.id, point.photo_path);
    closeDetailPanel();
  });
}

// ─────────────────────────────────────────────────────────────
// Filtros
// ─────────────────────────────────────────────────────────────

export function populateCabinetFilter(points) {
  const select = document.getElementById('filter-cabinet');
  if (!select) return;

  const cabinets = [...new Set(points.map(p => p.cabinet).filter(Boolean))].sort();
  const current  = select.value;

  select.innerHTML = '<option value="">— Todos los gabinetes —</option>';
  cabinets.forEach(c => {
    const opt   = document.createElement('option');
    opt.value   = c;
    opt.textContent = c;
    if (c === current) opt.selected = true;
    select.appendChild(opt);
  });
}

// ─────────────────────────────────────────────────────────────
// Tabla resumen
// ─────────────────────────────────────────────────────────────

export function renderSummaryTable(points) {
  const tbody = document.getElementById('summary-tbody');
  if (!tbody) return;

  if (points.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="table-empty">No hay puntos registrados.</td></tr>`;
    updateStatCounters([]);
    return;
  }

  tbody.innerHTML = points.map(p => {
    const { label, color } = classifyRSSI(p.rssi);
    return `
      <tr class="table-row" data-id="${p.id}">
        <td>${_esc(p.name)}</td>
        <td>${_esc(p.cabinet || '—')}</td>
        <td>${_esc(p.room || '—')}</td>
        <td>${_esc(p.zone || '—')}</td>
        <td><span class="rssi-badge" style="background:${color}">${p.rssi} dBm</span></td>
        <td><span class="quality-label">${label}</span></td>
      </tr>
    `;
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

// ─────────────────────────────────────────────────────────────
// Loader
// ─────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function _esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _setEl(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

window._closePanel = () => {
  document.getElementById('detail-panel')?.classList.remove('panel-open');
};
