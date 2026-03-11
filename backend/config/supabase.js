const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ CRITICAL: Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in environment!');
}

let supabase;
try {
  // If keys are missing, createClient might throw. We want the app to start but log clearly.
  if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    console.log('✅ Supabase connected!');
  } else {
    // Return a dummy object that logs errors when called
    supabase = {
      from: (table) => ({
        select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ error: { message: 'Supabase not configured. Set environment variables on Vercel.' } }), single: () => Promise.resolve({ error: { message: 'Supabase not configured' } }), insert: () => Promise.resolve({ error: { message: 'Supabase not configured' } }) }), insert: () => Promise.resolve({ error: { message: 'Supabase not configured' } }) }),
        update: () => ({ eq: () => Promise.resolve({ error: { message: 'Supabase not configured' } }) }),
        insert: () => ({ select: () => ({ single: () => Promise.resolve({ error: { message: 'Supabase not configured' } }) }) })
      })
    };
  }
} catch (err) {
  console.error('❌ Supabase Client Initialization Failed:', err.message);
  supabase = null;
}

module.exports = supabase;
