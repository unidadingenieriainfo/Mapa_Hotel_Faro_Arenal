// =============================================================
// js/app.js — Orquestador principal de la aplicación
// =============================================================

import { DEFAULT_MAP_ID }    from './config.js';
import { initAuth, isAuthenticated, loginWithEmail,
         logout, getCurrentUser }                   from './auth.js';
import { fetchMap, fetchPoints, createPoint,
         updatePoint, deletePoint, classifyRSSI }   from './points.js';
import { uploadPhoto, deletePhoto, replacePhoto,
         validateImageFile }                         from './storage.js';
import { initMap, renderPoints, upsertMarker,
         removeMarker, setEditMode, applyFilters }   from './map.js';
import { showToast, updateAuthUI, updateEditModeButton,
         openLoginModal, closeLoginModal, setLoginError,
         setLoginLoading, openCreatePointModal,
         closeCreatePointModal, openDetailPanel,
         closeDetailPanel, populateCabinetFilter,
         renderSummaryTable, showLoader, hideLoader } from './ui.js';

// ─────────────────────────────────────────────────────────────
// Estado global de la app
// ─────────────────────────────────────────────────────────────
let _currentMap    = null;
let _allPoints     = [];
let _editMode      = false;
let _pendingCoords = null;   // { x, y } al crear un punto

// ─────────────────────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────────────────────

async function init() {
  showLoader('Iniciando aplicación…');

  // 1. Autenticación
  await initAuth(onAuthStateChange);

  // 2. Inicializar mapa
  initMap({
    containerId:  'map-container',
    imageId:      'map-image',
    onPointClick: onMarkerClick,
    onMapClick:   onMapAreaClick,
    onPointMoved: onMarkerMoved,
  });

  // 3. Vincular eventos de UI globales
  bindGlobalEvents();

  // 4. Cargar mapa y puntos
  await loadMap(DEFAULT_MAP_ID);

  hideLoader();
}

// ─────────────────────────────────────────────────────────────
// Carga inicial
// ─────────────────────────────────────────────────────────────

async function loadMap(mapId) {
  showLoader('Cargando mapa…');

  const { map, error: mapError } = await fetchMap(mapId);
  if (mapError || !map) {
    hideLoader();
    showToast('No se pudo cargar el mapa. Verifica la configuración.', 'error');
    return;
  }

  _currentMap = map;
  const mapTitleEl = document.getElementById('map-title');
  mapTitleEl.textContent    = map.name;
  mapTitleEl.style.display  = '';   // visible: en el nuevo HTML arranca con display:none

  // Actualizar imagen base si existe URL en BD
  if (map.base_image_url && !map.base_image_url.startsWith('assets/')) {
    document.getElementById('map-image').src = map.base_image_url;
  }

  await loadPoints();
  hideLoader();
}

async function loadPoints() {
  if (!_currentMap) return;

  _allPoints = await fetchPoints(_currentMap.id);
  renderPoints(_allPoints);
  populateCabinetFilter(_allPoints);
  renderSummaryTable(_allPoints);
  applyCurrentFilters();
}

// ─────────────────────────────────────────────────────────────
// Cambio de estado de sesión
// ─────────────────────────────────────────────────────────────

function onAuthStateChange(user) {
  updateAuthUI(user);

  if (!user && _editMode) {
    _editMode = false;
    setEditMode(false);
    updateEditModeButton(false);
  }
}

// ─────────────────────────────────────────────────────────────
// Eventos globales de UI
// ─────────────────────────────────────────────────────────────

function bindGlobalEvents() {
  // ── Login ──────────────────────────────────────────────────
  document.getElementById('btn-login').addEventListener('click', openLoginModal);

  document.getElementById('btn-login-cancel').addEventListener('click', closeLoginModal);

  document.getElementById('btn-login-submit').addEventListener('click', handleLogin);

  document.getElementById('login-password').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleLogin();
  });

  document.getElementById('modal-login').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeLoginModal();
  });

  // ── Logout ─────────────────────────────────────────────────
  document.getElementById('btn-logout').addEventListener('click', async () => {
    await logout();
    showToast('Sesión cerrada.', 'info');
  });

  // ── Modo Edición ───────────────────────────────────────────
  document.getElementById('btn-toggle-edit').addEventListener('click', () => {
    if (!isAuthenticated()) { openLoginModal(); return; }
    _editMode = !_editMode;
    setEditMode(_editMode);
    updateEditModeButton(_editMode);
    showToast(_editMode ? '✏️ Modo edición activado' : '👁 Modo vista activado', 'info');
  });

  // ── Modal crear punto ──────────────────────────────────────
  document.getElementById('btn-cp-cancel').addEventListener('click', closeCreatePointModal);

  document.getElementById('modal-create-point').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeCreatePointModal();
  });

  document.getElementById('btn-cp-submit').addEventListener('click', handleCreatePoint);

  document.getElementById('cp-rssi').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleCreatePoint();
  });

  // ── Filtros ────────────────────────────────────────────────
  document.getElementById('filter-cabinet').addEventListener('change', applyCurrentFilters);
  document.getElementById('filter-rssi').addEventListener('change', applyCurrentFilters);

  // ── Clic en tabla resumen ──────────────────────────────────
  document.getElementById('summary-tbody').addEventListener('click', (e) => {
    const row = e.target.closest('tr[data-id]');
    if (!row) return;
    onMarkerClick(row.dataset.id);
  });

  // ── Cerrar panel lateral ───────────────────────────────────
  document.getElementById('btn-close-panel')?.addEventListener('click', closeDetailPanel);

  // ── Recargar puntos ────────────────────────────────────────
  document.getElementById('btn-refresh')?.addEventListener('click', loadPoints);
}

// ─────────────────────────────────────────────────────────────
// Flujo: Login
// ─────────────────────────────────────────────────────────────

async function handleLogin() {
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  if (!email || !password) {
    setLoginError('Ingresa correo y contraseña.');
    return;
  }

  setLoginLoading(true);
  const { user, error } = await loginWithEmail(email, password);
  setLoginLoading(false);

  if (error) {
    setLoginError('Credenciales incorrectas. Intenta de nuevo.');
    return;
  }

  closeLoginModal();
  showToast(`Bienvenido, ${user.email}`, 'success');
}

// ─────────────────────────────────────────────────────────────
// Flujo: Clic en mapa → crear punto
// ─────────────────────────────────────────────────────────────

function onMapAreaClick(xPercent, yPercent) {
  if (!isAuthenticated()) { openLoginModal(); return; }
  _pendingCoords = { x: xPercent, y: yPercent };
  openCreatePointModal(xPercent, yPercent, handleCreatePoint);
}

async function handleCreatePoint() {
  if (!_currentMap || !_pendingCoords) return;

  const name    = document.getElementById('cp-name').value.trim();
  const cabinet = document.getElementById('cp-cabinet').value.trim();
  const room    = document.getElementById('cp-room').value.trim();
  const zone    = document.getElementById('cp-zone').value.trim();
  const rssi    = parseInt(document.getElementById('cp-rssi').value);
  const notes   = document.getElementById('cp-notes').value.trim();
  const photoFile = document.getElementById('cp-photo').files?.[0];

  const errorEl = document.getElementById('cp-error');

  if (!name) { errorEl.textContent = 'El nombre es obligatorio.'; return; }
  if (isNaN(rssi) || rssi < -100 || rssi > 0) {
    errorEl.textContent = 'RSSI debe estar entre -100 y 0 dBm.'; return;
  }

  const btn = document.getElementById('btn-cp-submit');
  btn.disabled    = true;
  btn.textContent = 'Guardando…';
  errorEl.textContent = '';

  // 1. Insertar punto en BD
  const { point, error } = await createPoint({
    map_id:    _currentMap.id,
    name,
    cabinet:   cabinet || null,
    room:      room    || null,
    zone:      zone    || null,
    rssi,
    notes:     notes   || null,
    x_percent: _pendingCoords.x,
    y_percent: _pendingCoords.y,
  });

  if (error) {
    errorEl.textContent = 'Error al guardar el punto. Intenta de nuevo.';
    btn.disabled    = false;
    btn.textContent = 'Crear Punto';
    return;
  }

  // 2. Subir foto (si hay)
  if (photoFile) {
    const validation = validateImageFile(photoFile);
    if (!validation.valid) {
      showToast(validation.message, 'warning');
    } else {
      const { url, path, error: storageError } = await uploadPhoto(
        photoFile, _currentMap.id, point.id
      );
      if (!storageError && url) {
        await updatePoint(point.id, { photo_url: url, photo_path: path });
        point.photo_url  = url;
        point.photo_path = path;
      }
    }
  }

  // 3. Actualizar estado local y UI
  _allPoints.push(point);
  upsertMarker(point);
  populateCabinetFilter(_allPoints);
  renderSummaryTable(_allPoints);

  closeCreatePointModal();
  btn.disabled    = false;
  btn.textContent = 'Crear Punto';
  _pendingCoords  = null;

  showToast(`Punto "${point.name}" creado correctamente.`, 'success');
}

// ─────────────────────────────────────────────────────────────
// Flujo: Clic en marcador → detalle / edición
// ─────────────────────────────────────────────────────────────

function onMarkerClick(pointId) {
  const point = _allPoints.find(p => p.id === pointId);
  if (!point) return;

  openDetailPanel(point, _editMode && isAuthenticated(), {
    onSave:        handleSavePoint,
    onDelete:      handleDeletePoint,
    onPhotoUpload: handlePhotoUpload,
  });
}

// ─────────────────────────────────────────────────────────────
// Flujo: Guardar edición de punto
// ─────────────────────────────────────────────────────────────

async function handleSavePoint(pointId, updates) {
  const { point: updated, error } = await updatePoint(pointId, updates);
  if (error) { showToast('Error al guardar cambios.', 'error'); return; }

  // Actualizar estado local
  const idx = _allPoints.findIndex(p => p.id === pointId);
  if (idx >= 0) _allPoints[idx] = { ..._allPoints[idx], ...updated };

  upsertMarker(_allPoints[idx]);
  renderSummaryTable(_allPoints);
  populateCabinetFilter(_allPoints);
  showToast('Cambios guardados.', 'success');
}

// ─────────────────────────────────────────────────────────────
// Flujo: Eliminar punto
// ─────────────────────────────────────────────────────────────

async function handleDeletePoint(pointId, photoPath) {
  const { error } = await deletePoint(pointId);
  if (error) { showToast('Error al eliminar el punto.', 'error'); return; }

  if (photoPath) await deletePhoto(photoPath);

  _allPoints = _allPoints.filter(p => p.id !== pointId);
  removeMarker(pointId);
  renderSummaryTable(_allPoints);
  populateCabinetFilter(_allPoints);
  showToast('Punto eliminado.', 'info');
}

// ─────────────────────────────────────────────────────────────
// Flujo: Reemplazar foto de un punto en el panel
// ─────────────────────────────────────────────────────────────

async function handlePhotoUpload(file, pointId) {
  const validation = validateImageFile(file);
  if (!validation.valid) {
    showToast(validation.message, 'warning');
    return { error: validation };
  }

  const point = _allPoints.find(p => p.id === pointId);
  const { url, path, error } = await replacePhoto(
    file, _currentMap.id, pointId, point?.photo_path
  );

  if (error) {
    showToast('Error al subir la fotografía.', 'error');
    return { error };
  }

  await updatePoint(pointId, { photo_url: url, photo_path: path });

  if (point) {
    point.photo_url  = url;
    point.photo_path = path;
  }

  showToast('Fotografía actualizada.', 'success');
  return { error: null };
}

// ─────────────────────────────────────────────────────────────
// Flujo: Marcador movido (drag & drop)
// ─────────────────────────────────────────────────────────────

async function onMarkerMoved(pointId, xPercent, yPercent) {
  const { error } = await updatePoint(pointId, {
    x_percent: parseFloat(xPercent.toFixed(3)),
    y_percent: parseFloat(yPercent.toFixed(3)),
  });

  if (error) {
    showToast('Error al guardar la nueva posición.', 'error');
    return;
  }

  const point = _allPoints.find(p => p.id === pointId);
  if (point) {
    point.x_percent = xPercent;
    point.y_percent = yPercent;
  }
}

// ─────────────────────────────────────────────────────────────
// Filtros
// ─────────────────────────────────────────────────────────────

function applyCurrentFilters() {
  const cabinet  = document.getElementById('filter-cabinet')?.value  ?? '';
  const rssiClass = document.getElementById('filter-rssi')?.value   ?? '';
  applyFilters({ cabinet, rssiClass });
}

// ─────────────────────────────────────────────────────────────
// Arranque
// ─────────────────────────────────────────────────────────────
init().catch(err => {
  console.error('[app] Error crítico al iniciar:', err);
  hideLoader();
  document.body.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;height:100vh;
                font-family:monospace;color:#ef4444;text-align:center;padding:2rem;">
      <div>
        <h2>Error al iniciar la aplicación</h2>
        <p>Revisa la consola del navegador y verifica las credenciales en js/config.js</p>
        <pre style="margin-top:1rem;font-size:.8rem">${err.message}</pre>
      </div>
    </div>`;
});
