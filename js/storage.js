// ============================================================
// js/storage.js — Gestión de fotos en Supabase Storage
// ============================================================

import { supabase }       from './supabase-client.js';
import { STORAGE_BUCKET } from './config.js';

const ACCEPTED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export function validateImageFile(file) {
  if (!ACCEPTED_TYPES.includes(file.type))
    return { valid: false, message: 'Solo se aceptan imágenes JPG, PNG o WebP.' };
  if (file.size > MAX_SIZE_BYTES)
    return { valid: false, message: 'La imagen no debe superar los 5 MB.' };
  return { valid: true, message: '' };
}

/**
 * Sube UNA foto al bucket y devuelve su URL pública.
 * Ruta: {mapId}/{pointId}/{timestamp}_{safeName}.{ext}
 */
export async function uploadPhoto(file, mapId, pointId) {
  const ext       = file.name.split('.').pop().toLowerCase();
  const timestamp = Date.now();
  const safeName  = file.name
    .replace(/\.[^/.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .substring(0, 60);

  const path = `${mapId}/${pointId}/${timestamp}_${safeName}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET).upload(path, file, { cacheControl: '3600', upsert: false });

  if (uploadError) {
    console.error('[storage] uploadPhoto:', uploadError.message);
    return { url: null, path: null, error: uploadError };
  }

  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path, error: null };
}

/**
 * Sube MÚLTIPLES fotos y retorna array de { url, path }.
 * Las que fallen se omiten y se registran en consola.
 */
export async function uploadPhotos(files, mapId, pointId) {
  const results = [];
  for (const file of files) {
    const validation = validateImageFile(file);
    if (!validation.valid) {
      console.warn('[storage] Archivo inválido omitido:', file.name, validation.message);
      continue;
    }
    const result = await uploadPhoto(file, mapId, pointId);
    if (!result.error) results.push({ url: result.url, path: result.path });
  }
  return results;
}

/** Elimina una foto del bucket por su path */
export async function deletePhoto(photoPath) {
  if (!photoPath) return { error: null };
  const { error } = await supabase.storage.from(STORAGE_BUCKET).remove([photoPath]);
  if (error) console.error('[storage] deletePhoto:', error.message);
  return { error: error ?? null };
}

/** Elimina múltiples fotos */
export async function deletePhotos(photoPaths) {
  const validPaths = (photoPaths ?? []).filter(Boolean);
  if (!validPaths.length) return;
  const { error } = await supabase.storage.from(STORAGE_BUCKET).remove(validPaths);
  if (error) console.error('[storage] deletePhotos:', error.message);
}

/** Reemplaza una foto (elimina anterior y sube nueva) */
export async function replacePhoto(file, mapId, pointId, oldPhotoPath) {
  if (oldPhotoPath) await deletePhoto(oldPhotoPath);
  return uploadPhoto(file, mapId, pointId);
}
