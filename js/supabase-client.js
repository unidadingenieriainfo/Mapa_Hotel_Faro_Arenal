// =============================================================
// js/supabase-client.js — Cliente Supabase (singleton)
// =============================================================
// Importa el SDK de Supabase directamente desde esm.sh (CDN).
// Compatible con GitHub Pages sin necesidad de Node.js o bundlers.
// =============================================================

import { SUPABASE_URL, SUPABASE_ANON } from './config.js';

const { createClient } = await import(
  'https://esm.sh/@supabase/supabase-js@2'
);

/** Instancia única del cliente Supabase para toda la aplicación */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    // Persistir sesión en localStorage entre recargas de página
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
