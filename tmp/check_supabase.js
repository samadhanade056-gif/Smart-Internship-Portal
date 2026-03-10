require('dotenv').config({ path: 'c:/Users/Asus/Downloads/internai-v5-FINAL/internai-final-project/.env' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function check() {
    try {
        const { data, error } = await supabase.from('users').select('count', { count: 'exact' });
        if (error) {
            console.error('❌ Supabase error:', error.message);
            console.error('Details:', error);
        } else {
            console.log('✅ Supabase connected successfully!');
            console.log('User count:', data);
        }
    } catch (err) {
        console.error('❌ Crash:', err.message);
    }
}

check();
