// =============================================================
// js/supabase-client.js — Cliente Supabase
// =============================================================

import { SUPABASE_URL, SUPABASE_ANON } from './config.js';

const { createClient } = await import(
  'https://esm.sh/@supabase/supabase-js@2'
);

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
