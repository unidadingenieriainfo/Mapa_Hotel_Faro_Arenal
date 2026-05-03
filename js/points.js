// ============================================================
// js/points.js — CRUD de puntos WiFi en Supabase
// ============================================================

import { supabase }      from './supabase-client.js';
import { getCurrentUser } from './auth.js';

// ────────────────────────────────────────────────────────────
// Clasificación RSSI
// ────────────────────────────────────────────────────────────

/**
 * Clasifica la calidad de señal según RSSI (dBm).
 * Paleta alineada con Lecturas_Senal y Mapa_Hotel_Faro_Arenal.
 * @param {number} rssi
 * @returns {{ label:string, className:string, color:string }}
 */
export function classifyRSSI(rssi) {
  if (rssi >= -55) return { label: 'Excelente',  className: 'rssi-excellent', color: '#22c55e' };
  if (rssi >= -70) return { label: 'Bueno',      className: 'rssi-good',      color: '#3b82f6' };
  if (rssi >= -75) return { label: 'Regular',    className: 'rssi-fair',      color: '#f59e0b' };
  return            { label: 'Deficiente',  className: 'rssi-poor',      color: '#ef4444' };
}

// ────────────────────────────────────────────────────────────
// Leer mapa y puntos
// ────────────────────────────────────────────────────────────

export async function fetchMap(mapId) {
  const { data, error } = await supabase.from('maps').select('*').eq('id', mapId).single();
  if (error) { console.error('[points] fetchMap:', error.message); return { map: null, error }; }
  return { map: data, error: null };
}

export async function fetchAllMaps() {
  const { data, error } = await supabase.from('maps').select('*').order('created_at', { ascending: false });
  if (error) { console.error('[points] fetchAllMaps:', error.message); return []; }
  return data ?? [];
}

/**
 * Carga puntos WiFi de un mapa. Incluye el campo `photos` (JSONB array de URLs)
 * si existe en la tabla; si no, devuelve el array igualmente (vacío o con photo_url).
 */
export async function fetchPoints(mapId) {
  const { data, error } = await supabase
    .from('wifi_points')
    .select('*')
    .eq('map_id', mapId)
    .order('created_at', { ascending: true });

  if (error) { console.error('[points] fetchPoints:', error.message); return []; }

  // Normalizar: si el punto tiene photos (array JSON), úsalo;
  // si no, construye array desde photo_url para compatibilidad.
  return (data ?? []).map(_normalizePoint);
}

/** Normaliza el campo photos para que siempre sea un array de URLs */
function _normalizePoint(p) {
  let photos = [];
  if (Array.isArray(p.photos))   photos = p.photos;
  else if (p.photo_url)          photos = [p.photo_url];
  return { ...p, photos };
}

// ────────────────────────────────────────────────────────────
// Crear punto
// ────────────────────────────────────────────────────────────

export async function createPoint(pointData) {
  const user = getCurrentUser();
  if (!user) return { point: null, error: { message: 'No autenticado' } };

  const payload = { ...pointData, created_by: user.id };

  const { data, error } = await supabase
    .from('wifi_points').insert(payload).select().single();

  if (error) { console.error('[points] createPoint:', error.message); return { point: null, error }; }
  return { point: _normalizePoint(data), error: null };
}

// ────────────────────────────────────────────────────────────
// Actualizar punto
// ────────────────────────────────────────────────────────────

export async function updatePoint(pointId, updates) {
  const { data, error } = await supabase
    .from('wifi_points').update(updates).eq('id', pointId).select().single();

  if (error) { console.error('[points] updatePoint:', error.message); return { point: null, error }; }
  return { point: _normalizePoint(data), error: null };
}

// ────────────────────────────────────────────────────────────
// Eliminar punto
// ────────────────────────────────────────────────────────────

export async function deletePoint(pointId) {
  const { error } = await supabase.from('wifi_points').delete().eq('id', pointId);
  if (error) { console.error('[points] deletePoint:', error.message); return { error }; }
  return { error: null };
}
