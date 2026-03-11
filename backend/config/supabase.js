/**
 * Supabase Client
 * File: backend/config/supabase.js
 */
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env!');
  // process.exit(1); // Don't crash, let the routes handle it or log it.
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
console.log('✅ Supabase connected!');

module.exports = supabase;
