// =============================================================
// js/points.js — CRUD de puntos WiFi en Supabase
// =============================================================

import { supabase } from './supabase-client.js';
import { getCurrentUser } from './auth.js';

// ─────────────────────────────────────────────────────────────
// RSSI: clasificación y color
// ─────────────────────────────────────────────────────────────

/**
 * Clasifica la calidad de señal según RSSI (dBm).
 * @param {number} rssi
 * @returns {{ label: string, className: string, color: string }}
 */
export function classifyRSSI(rssi) {
  if (rssi >= -55)              return { label: 'Excelente', className: 'rssi-excellent', color: '#22c55e' };
  if (rssi >= -70)              return { label: 'Bueno',     className: 'rssi-good',      color: '#3b82f6' };
  if (rssi >= -75)              return { label: 'Regular',   className: 'rssi-fair',       color: '#f59e0b' };
  /* rssi <= -76 */             return { label: 'Deficiente',className: 'rssi-poor',       color: '#ef4444' };
}

// ─────────────────────────────────────────────────────────────
// Leer puntos de un mapa
// ─────────────────────────────────────────────────────────────

/**
 * Carga todos los puntos WiFi del mapa indicado.
 * @param {string} mapId  UUID del mapa
 * @returns {Promise<Array>}
 */
export async function fetchPoints(mapId) {
  const { data, error } = await supabase
    .from('wifi_points')
    .select('*')
    .eq('map_id', mapId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[points] Error al cargar puntos:', error.message);
    return [];
  }
  return data ?? [];
}

// ─────────────────────────────────────────────────────────────
// Crear punto
// ─────────────────────────────────────────────────────────────

/**
 * Inserta un nuevo punto WiFi en la base de datos.
 * @param {Object} pointData  Datos del punto (sin id ni timestamps)
 * @returns {{ point: Object|null, error: Object|null }}
 */
export async function createPoint(pointData) {
  const user = getCurrentUser();
  if (!user) return { point: null, error: { message: 'No autenticado' } };

  const payload = {
    ...pointData,
    created_by: user.id,
  };

  const { data, error } = await supabase
    .from('wifi_points')
    .insert(payload)
    .select()
    .single();

  if (error) {
    console.error('[points] Error al crear punto:', error.message);
    return { point: null, error };
  }
  return { point: data, error: null };
}

// ─────────────────────────────────────────────────────────────
// Actualizar punto
// ─────────────────────────────────────────────────────────────

/**
 * Actualiza campos de un punto existente.
 * @param {string} pointId   UUID del punto
 * @param {Object} updates   Campos a actualizar
 * @returns {{ point: Object|null, error: Object|null }}
 */
export async function updatePoint(pointId, updates) {
  const { data, error } = await supabase
    .from('wifi_points')
    .update(updates)
    .eq('id', pointId)
    .select()
    .single();

  if (error) {
    console.error('[points] Error al actualizar punto:', error.message);
    return { point: null, error };
  }
  return { point: data, error: null };
}

// ─────────────────────────────────────────────────────────────
// Eliminar punto
// ─────────────────────────────────────────────────────────────

/**
 * Elimina un punto WiFi de la base de datos.
 * @param {string} pointId   UUID del punto
 * @returns {{ error: Object|null }}
 */
export async function deletePoint(pointId) {
  const { error } = await supabase
    .from('wifi_points')
    .delete()
    .eq('id', pointId);

  if (error) {
    console.error('[points] Error al eliminar punto:', error.message);
    return { error };
  }
  return { error: null };
}

// ─────────────────────────────────────────────────────────────
// Cargar datos de un mapa
// ─────────────────────────────────────────────────────────────

/**
 * Carga la información base de un mapa por su ID.
 * @param {string} mapId
 * @returns {{ map: Object|null, error: Object|null }}
 */
export async function fetchMap(mapId) {
  const { data, error } = await supabase
    .from('maps')
    .select('*')
    .eq('id', mapId)
    .single();

  if (error) {
    console.error('[points] Error al cargar mapa:', error.message);
    return { map: null, error };
  }
  return { map: data, error: null };
}

/**
 * Carga todos los mapas disponibles.
 * @returns {Promise<Array>}
 */
export async function fetchAllMaps() {
  const { data, error } = await supabase
    .from('maps')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[points] Error al cargar mapas:', error.message);
    return [];
  }
  return data ?? [];
}
