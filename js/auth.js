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
export async function initAuth(onAuthChange) {
  const { data: { session } } = await supabase.auth.getSession();
  _currentUser = session?.user ?? null;
  onAuthChange(_currentUser);

  supabase.auth.onAuthStateChange((_event, session) => {
    _currentUser = session?.user ?? null;
    onAuthChange(_currentUser);
  });
}

/** Login email + password */
export async function loginWithEmail(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { user: null, error };
  return { user: data.user, error: null };
}

/** Logout */
export async function logout() {
  const { error } = await supabase.auth.signOut();
  if (error) console.error('[auth] Error al cerrar sesión:', error.message);
}
