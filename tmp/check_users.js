require('dotenv').config({ path: 'c:/Users/Asus/Downloads/internai-v5-FINAL/internai-final-project/.env' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function checkUsers() {
    try {
        const { data, error } = await supabase.from('users').select('name, email');
        if (error) {
            console.error('❌ Supabase error:', error.message);
        } else {
            console.log('Registered Users:');
            if (data.length === 0) {
                console.log(' (No users found)');
            } else {
                data.forEach(u => console.log(` - ${u.name} (${u.email})`));
            }
        }
    } catch (err) {
        console.error('❌ Error:', err.message);
    }
}

checkUsers();
