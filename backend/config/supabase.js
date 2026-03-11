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
    // Return a dummy object that returns null data instead of errors
    // This allows the app to stay in "Demo Mode" without crashing or showing error toasts
    const dummyQuery = {
      select: () => dummyQuery,
      update: () => dummyQuery,
      insert: () => dummyQuery,
      delete: () => dummyQuery,
      eq: () => dummyQuery,
      ilike: () => dummyQuery,
      or: () => dummyQuery,
      order: () => dummyQuery,
      limit: () => dummyQuery,
      single: () => Promise.resolve({ data: null, error: null }),
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      then: (resolve) => resolve({ data: [], error: null })
    };
    supabase = {
      from: () => dummyQuery
    };
    console.log('⚠️ Supabase not configured - Running in Demo/Safe mode.');
  }
} catch (err) {
  console.error('❌ Supabase Client Initialization Failed:', err.message);
  supabase = null;
}

module.exports = supabase;
