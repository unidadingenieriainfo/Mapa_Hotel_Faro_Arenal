// =============================================================
// js/storage.js — Gestión de fotos en Supabase Storage
// =============================================================

import { supabase }       from './supabase-client.js';
import { STORAGE_BUCKET } from './config.js';

// ─────────────────────────────────────────────────────────────
// Subir fotografía
// ─────────────────────────────────────────────────────────────

/**
 * Sube una fotografía al bucket y devuelve la URL pública.
 *
 * Ruta en Storage: wifi-points/{mapId}/{pointId}/{timestamp}_{filename}
 *
 * @param {File}   file     Archivo de imagen seleccionado por el usuario
 * @param {string} mapId    UUID del mapa
 * @param {string} pointId  UUID del punto
 * @returns {{ url: string|null, path: string|null, error: Object|null }}
 */
export async function uploadPhoto(file, mapId, pointId) {
  // Generar nombre único para evitar colisiones de caché
  const ext       = file.name.split('.').pop().toLowerCase();
  const timestamp = Date.now();
  const safeName  = file.name
    .replace(/\.[^/.]+$/, '')            // quitar extensión
    .replace(/[^a-zA-Z0-9_-]/g, '_')    // caracteres seguros
    .substring(0, 60);                   // limitar longitud

  const path = `${mapId}/${pointId}/${timestamp}_${safeName}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    });

  if (uploadError) {
    console.error('[storage] Error al subir foto:', uploadError.message);
    return { url: null, path: null, error: uploadError };
  }

  // Obtener URL pública
  const { data } = supabase.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(path);

  return { url: data.publicUrl, path, error: null };
}

// ─────────────────────────────────────────────────────────────
// Eliminar fotografía
// ─────────────────────────────────────────────────────────────

/**
 * Elimina una fotografía del bucket por su ruta.
 * @param {string} photoPath  Ruta almacenada en la columna photo_path
 * @returns {{ error: Object|null }}
 */
export async function deletePhoto(photoPath) {
  if (!photoPath) return { error: null };

  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .remove([photoPath]);

  if (error) {
    console.error('[storage] Error al eliminar foto:', error.message);
    return { error };
  }
  return { error: null };
}

// ─────────────────────────────────────────────────────────────
// Reemplazar fotografía (eliminar anterior + subir nueva)
// ─────────────────────────────────────────────────────────────

/**
 * Reemplaza la fotografía de un punto: elimina la anterior y sube la nueva.
 * @param {File}        file          Nuevo archivo de imagen
 * @param {string}      mapId
 * @param {string}      pointId
 * @param {string|null} oldPhotoPath  Ruta de la foto anterior (puede ser null)
 * @returns {{ url: string|null, path: string|null, error: Object|null }}
 */
export async function replacePhoto(file, mapId, pointId, oldPhotoPath) {
  // Intentar eliminar la foto anterior (no bloquear si falla)
  if (oldPhotoPath) {
    await deletePhoto(oldPhotoPath);
  }
  return uploadPhoto(file, mapId, pointId);
}

// ─────────────────────────────────────────────────────────────
// Validar archivo de imagen
// ─────────────────────────────────────────────────────────────

/** Tipos MIME aceptados */
const ACCEPTED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

/** Tamaño máximo: 5 MB */
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

/**
 * Valida que un archivo sea una imagen aceptable.
 * @param {File} file
 * @returns {{ valid: boolean, message: string }}
 */
export function validateImageFile(file) {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return { valid: false, message: 'Solo se aceptan imágenes JPG, PNG o WebP.' };
  }
  if (file.size > MAX_SIZE_BYTES) {
    return { valid: false, message: 'La imagen no debe superar los 5 MB.' };
  }
  return { valid: true, message: '' };
}
