require('dotenv').config({ path: 'c:/Users/Asus/Downloads/internai-v5-FINAL/internai-final-project/.env' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function fixSchema() {
    console.log('Attempting to add missing columns to Supabase...');
    try {
        // We can't run arbitrary SQL via the standard supabase-js client easily unless we have a RPC function.
        // But we can check if we can insert/update it.
        // Actually, the best way for the user is to run it in the SQL editor.
        // Let's try to verify if it's REALLY missing one more time.
        const { data, error } = await supabase.from('users').select('*').limit(1);
        if (error) {
            console.error('Error fetching user:', error.message);
            return;
        }

        const columns = Object.keys(data[0]);
        console.log('Current columns:', columns);

        if (!columns.includes('resume_text')) {
            console.log('❌ "resume_text" IS MISSING.');
        } else {
            console.log('✅ "resume_text" IS PRESENT.');
        }
    } catch (err) {
        console.error('Crash:', err.message);
    }
}
fixSchema();
