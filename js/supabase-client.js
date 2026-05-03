// supabase-client.js — Usa window.supabase cargado desde CDN UMD
import { SUPABASE_URL, SUPABASE_ANON } from './config.js';

if (!window.supabase) {
  throw new Error('[supabase-client] window.supabase no disponible. Verifica que el CDN cargó.');
}

export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    persistSession:     true,
    autoRefreshToken:   true,
    detectSessionInUrl: true,
  },
});

console.log('[supabase-client] Cliente inicializado:', SUPABASE_URL);
