const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ CRITICAL: Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in environment!');
}

let supabase;
try {
  if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    console.log('✅ Supabase connected!');
  } else {
    // Return a dummy promise-like query builder that supports await
    const dummyPromise = Promise.resolve({ data: [], error: null });
    Object.assign(dummyPromise, {
      select: () => dummyPromise,
      update: () => dummyPromise,
      insert: () => dummyPromise,
      delete: () => dummyPromise,
      eq: () => dummyPromise,
      ilike: () => dummyPromise,
      or: () => dummyPromise,
      order: () => dummyPromise,
      limit: () => dummyPromise,
      single: () => Promise.resolve({ data: null, error: null }),
      maybeSingle: () => Promise.resolve({ data: null, error: null })
    });
    
    supabase = {
      from: () => dummyPromise
    };
    console.log('⚠️ Supabase not configured - Running in Demo/Safe mode.');
  }
} catch (err) {
  console.error('❌ Supabase Client Initialization Failed:', err.message);
  supabase = null;
}

module.exports = supabase;
