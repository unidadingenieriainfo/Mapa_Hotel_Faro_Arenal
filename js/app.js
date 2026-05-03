// app.js — Orquestador principal
import { DEFAULT_MAP_ID } from './config.js';
import { initAuth, loginWithEmail, logout, getCurrentUser, isAuthenticated } from './auth.js';
import { fetchPoints, createPoint, updatePoint, deletePoint, classifyRSSI } from './points.js';
import { uploadPhotos, deletePhotos } from './storage.js';
import {
  initMap, setEditMode, renderPoints, upsertMarker, removeMarker, applyFilters
} from './map.js';
import {
  showToast, updateAuthUI, updateEditModeButton,
  openLoginModal, closeLoginModal,
  openCreatePointModal, closeCreatePointModal, getPendingPhotoFiles,
  openPointViewer, closePointViewer,
  openDetailPanel, closeDetailPanel,
  renderPointList, setActivePointInList,
  populateCabinetFilter, renderSummaryTable, updateStatCounters,
  showLoader, hideLoader
} from './ui.js';

// ─── Estado global ────────────────────────────────────────────────────────────
let _allPoints  = [];
let _editMode   = false;
let _pendingXY  = null;   // {x,y} coord click sobre el mapa

// ─── Bootstrap ────────────────────────────────────────────────────────────────
async function init() {
  try {
    showLoader();

    await initAuth({
      onSignIn: handleSignIn,
      onSignOut: handleSignOut,
    });

    initMap({
      onAreaClick: handleMapAreaClick,
      onMarkerClick: handleMarkerClick,
    });

    _bindGlobalEvents();
    await _loadPoints();

  } catch (err) {
    console.error('[app] init error:', err);
    showToast('Error al inicializar la aplicación', 'error');
  } finally {
    hideLoader();
  }
}

// ─── Carga de puntos ─────────────────────────────────────────────────────────
async function _loadPoints() {
  try {
    showLoader();
    _allPoints = await fetchPoints(DEFAULT_MAP_ID);

    renderPoints(_allPoints);
    renderPointList(_allPoints, handlePointListClick);
    renderSummaryTable(_allPoints);
    updateStatCounters(_allPoints);
    populateCabinetFilter(_allPoints, _applyCurrentFilters);
    _applyCurrentFilters();
  } catch (err) {
    console.error('[app] _loadPoints error:', err);
    showToast('Error al cargar los puntos', 'error');
  } finally {
    hideLoader();
  }
}

// ─── Filtros ─────────────────────────────────────────────────────────────────
function _applyCurrentFilters() {
  const cabinet = document.getElementById('filter-cabinet')?.value || 'all';
  const rssi    = document.getElementById('filter-rssi')?.value    || 'all';
  applyFilters({ cabinet, rssi });
}

// ─── Clicks sobre el mapa ────────────────────────────────────────────────────
function handleMapAreaClick(x, y) {
  if (!_editMode || !isAuthenticated()) return;
  _pendingXY = { x, y };
  openCreatePointModal();
}

function handleMarkerClick(pointId) {
  const point = _allPoints.find(p => p.id === pointId);
  if (!point) return;
  setActivePointInList(pointId);

  if (_editMode) {
    openDetailPanel(point, {
      onSave:   handleSavePoint,
      onDelete: handleDeletePoint,
    });
  } else {
    openPointViewer(point);
  }
}

function handlePointListClick(pointId) {
  handleMarkerClick(pointId);
}

// ─── Crear punto ─────────────────────────────────────────────────────────────
async function handleCreatePoint() {
  const form = document.getElementById('create-point-form');
  if (!form) return;

  const label       = form.querySelector('#cp-label')?.value.trim();
  const description = form.querySelector('#cp-description')?.value.trim();
  const rssi        = parseFloat(form.querySelector('#cp-rssi')?.value);
  const cabinet     = form.querySelector('#cp-cabinet')?.value.trim();
  const port        = form.querySelector('#cp-port')?.value.trim();

  if (!label || isNaN(rssi) || !_pendingXY) {
    showToast('Completa los campos obligatorios', 'warning');
    return;
  }

  try {
    showLoader();

    // 1) Crear el punto sin fotos
    const newPoint = await createPoint({
      map_id:      DEFAULT_MAP_ID,
      label,
      description,
      rssi,
      cabinet,
      port,
      x_pct:       _pendingXY.x,
      y_pct:       _pendingXY.y,
    });

    // 2) Subir fotos si existen
    const files = getPendingPhotoFiles();
    if (files.length > 0) {
      const urls = await uploadPhotos(newPoint.id, files);
      if (urls.length > 0) {
        const updated = await updatePoint(newPoint.id, { photos: urls, photo_url: urls[0] });
        Object.assign(newPoint, updated);
      }
    }

    // 3) Actualizar estado local y UI
    _allPoints.push(newPoint);
    upsertMarker(newPoint);
    renderPointList(_allPoints, handlePointListClick);
    renderSummaryTable(_allPoints);
    updateStatCounters(_allPoints);
    populateCabinetFilter(_allPoints, _applyCurrentFilters);
    _applyCurrentFilters();
    closeCreatePointModal();
    showToast(`Punto "${label}" creado`, 'success');

  } catch (err) {
    console.error('[app] handleCreatePoint error:', err);
    showToast('Error al crear el punto', 'error');
  } finally {
    hideLoader();
    _pendingXY = null;
  }
}

// ─── Guardar punto (edit panel) ───────────────────────────────────────────────
async function handleSavePoint(pointId, changes, newFiles) {
  try {
    showLoader();

    const point = _allPoints.find(p => p.id === pointId);
    if (!point) throw new Error('Punto no encontrado');

    // Subir fotos nuevas
    if (newFiles && newFiles.length > 0) {
      const newUrls = await uploadPhotos(pointId, newFiles);
      const existing = point.photos || [];
      changes.photos    = [...existing, ...newUrls];
      changes.photo_url = changes.photos[0];
    }

    const updated = await updatePoint(pointId, changes);
    const idx = _allPoints.findIndex(p => p.id === pointId);
    _allPoints[idx] = { ..._allPoints[idx], ...updated };

    upsertMarker(_allPoints[idx]);
    renderPointList(_allPoints, handlePointListClick);
    renderSummaryTable(_allPoints);
    updateStatCounters(_allPoints);
    _applyCurrentFilters();
    closeDetailPanel();
    showToast('Punto actualizado', 'success');

  } catch (err) {
    console.error('[app] handleSavePoint error:', err);
    showToast('Error al guardar el punto', 'error');
  } finally {
    hideLoader();
  }
}

// ─── Eliminar punto ───────────────────────────────────────────────────────────
async function handleDeletePoint(pointId) {
  if (!confirm('¿Eliminar este punto? Esta acción no se puede deshacer.')) return;

  try {
    showLoader();

    const point = _allPoints.find(p => p.id === pointId);
    if (point?.photos?.length) {
      await deletePhotos(point.photos).catch(() => {});
    }

    await deletePoint(pointId);
    _allPoints = _allPoints.filter(p => p.id !== pointId);

    removeMarker(pointId);
    renderPointList(_allPoints, handlePointListClick);
    renderSummaryTable(_allPoints);
    updateStatCounters(_allPoints);
    populateCabinetFilter(_allPoints, _applyCurrentFilters);
    _applyCurrentFilters();
    closeDetailPanel();
    showToast('Punto eliminado', 'success');

  } catch (err) {
    console.error('[app] handleDeletePoint error:', err);
    showToast('Error al eliminar el punto', 'error');
  } finally {
    hideLoader();
  }
}

// ─── Auth callbacks ───────────────────────────────────────────────────────────
function handleSignIn(user) {
  updateAuthUI(user);
  showToast(`Sesión iniciada: ${user.email}`, 'success');
}

function handleSignOut() {
  updateAuthUI(null);
  if (_editMode) _toggleEditMode(false);
  showToast('Sesión cerrada', 'info');
}

// ─── Toggle modo edición ──────────────────────────────────────────────────────
function _toggleEditMode(forceValue) {
  _editMode = forceValue !== undefined ? forceValue : !_editMode;
  setEditMode(_editMode);
  updateEditModeButton(_editMode);
  document.body.classList.toggle('edit-active', _editMode);

  if (!_editMode) {
    closeDetailPanel();
  }
}

// ─── Eventos globales ─────────────────────────────────────────────────────────
function _bindGlobalEvents() {

  // ── Login modal ──────────────────────────────────────────────────────────
  document.getElementById('btn-login')?.addEventListener('click', openLoginModal);
  document.getElementById('btn-logout')?.addEventListener('click', async () => {
    await logout();
  });

  document.getElementById('btn-login-submit')?.addEventListener('click', async () => {
    const email    = document.getElementById('login-email')?.value.trim();
    const password = document.getElementById('login-password')?.value;
    if (!email || !password) { showToast('Ingresa email y contraseña', 'warning'); return; }
    try {
      showLoader();
      await loginWithEmail(email, password);
      closeLoginModal();
    } catch (err) {
      showToast('Credenciales incorrectas', 'error');
    } finally {
      hideLoader();
    }
  });

  document.getElementById('login-password')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('btn-login-submit')?.click();
  });

  document.getElementById('btn-close-login')?.addEventListener('click', closeLoginModal);
  document.getElementById('login-overlay')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeLoginModal();
  });

  // ── Modo edición ─────────────────────────────────────────────────────────
  document.getElementById('btn-toggle-edit')?.addEventListener('click', () => {
    if (!isAuthenticated()) { showToast('Debes iniciar sesión para editar', 'warning'); return; }
    _toggleEditMode();
  });

  // ── Crear punto (submit) ─────────────────────────────────────────────────
  document.getElementById('btn-cp-submit')?.addEventListener('click', handleCreatePoint);
  document.getElementById('btn-cp-cancel')?.addEventListener('click', closeCreatePointModal);
  document.getElementById('create-point-overlay')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeCreatePointModal();
  });

  // ── Filtros ───────────────────────────────────────────────────────────────
  document.getElementById('filter-cabinet')?.addEventListener('change', _applyCurrentFilters);
  document.getElementById('filter-rssi')?.addEventListener('change',    _applyCurrentFilters);

  // ── Tabla resumen — click fila ────────────────────────────────────────────
  document.getElementById('summary-tbody')?.addEventListener('click', e => {
    const row = e.target.closest('tr[data-point-id]');
    if (!row) return;
    handleMarkerClick(row.dataset.pointId);
  });

  // ── Refrescar ─────────────────────────────────────────────────────────────
  document.getElementById('btn-refresh')?.addEventListener('click', _loadPoints);

  // ── Sidebar toggle (móvil) ────────────────────────────────────────────────
  document.getElementById('btn-toggle-sidebar')?.addEventListener('click', () => {
    document.querySelector('.sidebar')?.classList.toggle('open');
  });

  // ── Keyboard ─────────────────────────────────────────────────────────────
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      // cierra en orden: lightbox → viewer → detail panel → login
      const lightbox = document.getElementById('app-lightbox');
      const viewer   = document.getElementById('viewer-overlay');
      const detail   = document.getElementById('detail-panel');
      const login    = document.getElementById('login-overlay');

      if (lightbox && !lightbox.hidden) { lightbox.hidden = true; return; }
      if (viewer   && viewer.classList.contains('open')) { closePointViewer(); return; }
      if (detail   && detail.classList.contains('open')) { closeDetailPanel(); return; }
      if (login    && login.classList.contains('open'))  { closeLoginModal();  return; }
    }
  });
}

// ─── Entry point ──────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
