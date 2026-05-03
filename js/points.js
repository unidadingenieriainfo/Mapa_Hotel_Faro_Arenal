// ============================================================
// js/points.js — CRUD de puntos WiFi en Supabase
// Campos DB: label, description, rssi, cabinet, port,
//            x_pct, y_pct, photos (JSONB), photo_url
// ============================================================

import { supabase }       from './supabase-client.js';
import { getCurrentUser } from './auth.js';

// ── Clasificación RSSI ───────────────────────────────────────

export function classifyRSSI(rssi) {
  if (rssi >= -55) return { label: 'Excelente', className: 'rssi-excellent', color: '#22c55e' };
  if (rssi >= -70) return { label: 'Bueno',     className: 'rssi-good',      color: '#3b82f6' };
  if (rssi >= -75) return { label: 'Regular',   className: 'rssi-fair',      color: '#f59e0b' };
  return             { label: 'Deficiente', className: 'rssi-poor',      color: '#ef4444' };
}

// ── Normalizar punto ─────────────────────────────────────────

function _normalize(p) {
  let photos = [];
  if (Array.isArray(p.photos)) photos = p.photos;
  else if (p.photo_url)        photos = [p.photo_url];
  return { ...p, photos };
}

// ── Mapas ─────────────────────────────────────────────────────

export async function fetchMap(mapId) {
  const { data, error } = await supabase.from('maps').select('*').eq('id', mapId).single();
  if (error) throw new Error('[points] fetchMap: ' + error.message);
  return data;
}

// ── Puntos ────────────────────────────────────────────────────

export async function fetchPoints(mapId) {
  const { data, error } = await supabase
    .from('wifi_points')
    .select('*')
    .eq('map_id', mapId)
    .order('created_at', { ascending: true });
  if (error) throw new Error('[points] fetchPoints: ' + error.message);
  return (data ?? []).map(_normalize);
}

/** Crea un punto. Devuelve el punto normalizado (lanza Error si falla). */
export async function createPoint(payload) {
  const user = getCurrentUser();
  if (!user) throw new Error('No autenticado');

  const { data, error } = await supabase
    .from('wifi_points')
    .insert({ ...payload, created_by: user.id })
    .select()
    .single();

  if (error) throw new Error('[points] createPoint: ' + error.message);
  return _normalize(data);
}

/** Actualiza un punto. Devuelve el punto normalizado (lanza Error si falla). */
export async function updatePoint(pointId, updates) {
  const { data, error } = await supabase
    .from('wifi_points')
    .update(updates)
    .eq('id', pointId)
    .select()
    .single();

  if (error) throw new Error('[points] updatePoint: ' + error.message);
  return _normalize(data);
}

/** Elimina un punto (lanza Error si falla). */
export async function deletePoint(pointId) {
  const { error } = await supabase.from('wifi_points').delete().eq('id', pointId);
  if (error) throw new Error('[points] deletePoint: ' + error.message);
}
