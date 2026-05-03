// ============================================================
// js/auth.js — Autenticación con Supabase Auth
// ============================================================

import { supabase } from './supabase-client.js';

let _currentUser = null;

export function getCurrentUser()   { return _currentUser; }
export function isAuthenticated()  { return !!_currentUser; }

/**
 * Inicia el módulo de autenticación.
 * @param {Function} onAuthChange  Callback(user|null) al cambiar sesión
 */
export async function initAuth({ onSignIn, onSignOut } = {}) {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) console.warn('[auth] getSession error:', error.message);

  _currentUser = session?.user ?? null;
  if (_currentUser) onSignIn?.(_currentUser);
  else              onSignOut?.();

  supabase.auth.onAuthStateChange((_event, sess) => {
    _currentUser = sess?.user ?? null;
    if (_currentUser) onSignIn?.(_currentUser);
    else              onSignOut?.();
  });
}

/** Login email + password */
export async function loginWithEmail(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

/** Logout */
export async function logout() {
  const { error } = await supabase.auth.signOut();
  if (error) console.error('[auth] Error al cerrar sesión:', error.message);
}
