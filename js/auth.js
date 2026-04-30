// =============================================================
// js/auth.js — Autenticación con Supabase Auth
// =============================================================

import { supabase } from './supabase-client.js';

// ─────────────────────────────────────────────────────────────
// Estado de sesión actual
// ─────────────────────────────────────────────────────────────
let _currentSession = null;
let _currentUser    = null;

/** Devuelve el usuario activo o null */
export function getCurrentUser() { return _currentUser; }

/** Devuelve true si hay sesión activa */
export function isAuthenticated() { return !!_currentUser; }

// ─────────────────────────────────────────────────────────────
// Inicialización: sincroniza estado y escucha cambios
// ─────────────────────────────────────────────────────────────
/**
 * Inicia el módulo de autenticación.
 * @param {Function} onAuthChange  Callback(user|null) llamado al cambiar sesión
 */
export async function initAuth(onAuthChange) {
  // Recuperar sesión preexistente
  const { data: { session } } = await supabase.auth.getSession();
  _currentSession = session;
  _currentUser    = session?.user ?? null;
  onAuthChange(_currentUser);

  // Escuchar cambios futuros (login, logout, expiración de token)
  supabase.auth.onAuthStateChange((_event, session) => {
    _currentSession = session;
    _currentUser    = session?.user ?? null;
    onAuthChange(_currentUser);
  });
}

// ─────────────────────────────────────────────────────────────
// Login con email + password
// ─────────────────────────────────────────────────────────────
/**
 * @param {string} email
 * @param {string} password
 * @returns {{ user, error }}
 */
export async function loginWithEmail(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { user: null, error };
  return { user: data.user, error: null };
}

// ─────────────────────────────────────────────────────────────
// Logout
// ─────────────────────────────────────────────────────────────
export async function logout() {
  const { error } = await supabase.auth.signOut();
  if (error) console.error('[auth] Error al cerrar sesión:', error.message);
}

// ─────────────────────────────────────────────────────────────
// Registro de nuevo usuario (opcional para admin)
// ─────────────────────────────────────────────────────────────
/**
 * @param {string} email
 * @param {string} password
 * @returns {{ user, error }}
 */
export async function registerWithEmail(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return { user: null, error };
  return { user: data.user, error: null };
}
