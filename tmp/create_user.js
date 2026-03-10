require('dotenv').config({ path: 'c:/Users/Asus/Downloads/internai-v5-FINAL/internai-final-project/.env' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const bcrypt = require('bcryptjs');

async function createUser() {
    const email = 'yoginiade05@gmail.com';
    const password = 'password123';
    const hashed = await bcrypt.hash(password, 10);

    try {
        const { data: existing } = await supabase.from('users').select('id').eq('email', email).maybeSingle();
        if (existing) {
            console.log('User already exists. Updating password...');
            await supabase.from('users').update({ password: hashed }).eq('id', existing.id);
        } else {
            console.log('Creating new user...');
            const { error } = await supabase.from('users').insert({
                name: 'Yogini',
                email: email,
                password: hashed,
                avatar_color: '#10b981'
            });
            if (error) throw error;
        }
        console.log('✅ Success! You can now log in with:');
        console.log('Email: yoginiade05@gmail.com');
        console.log('Password: password123');
    } catch (err) {
        console.error('❌ Error:', err.message);
    }
}

createUser();
