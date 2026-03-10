require('dotenv').config({ path: 'c:/Users/Asus/Downloads/internai-v5-FINAL/internai-final-project/.env' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function checkColumns() {
    try {
        const { data: rows, error: insErr } = await supabase.from('users').insert({
            name: 'Test', email: 'test_' + Date.now() + '@example.com', password: 'hash'
        }).select();
        if (insErr) {
            console.error('❌ Insert failed! Error:', insErr.message);
        } else {
            console.log('Available columns: ' + JSON.stringify(Object.keys(rows[0])));
            await supabase.from('users').delete().eq('id', rows[0].id);
        }
    } catch (err) {
        console.error('❌ Crash:', err.message);
    }
}

checkColumns();
