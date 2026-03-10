require('dotenv').config({ path: 'c:/Users/Asus/Downloads/internai-v5-FINAL/internai-final-project/.env' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const bcrypt = require('bcryptjs');

async function testFullFlow() {
    const email = 'ieshu_' + Date.now() + '@gmail.com';
    const password = 'password123';

    try {
        console.log('1. Registering ' + email + '...');
        const hashed = await bcrypt.hash(password, 10);
        const { data: user, error: regErr } = await supabase.from('users').insert({
            name: 'Ieshu Test', email, password: hashed
        }).select().single();

        if (regErr) {
            console.error('❌ Register error:', regErr.message);
            return;
        }
        console.log('✅ Registered! ID:', user.id);

        console.log('2. Checking login logic (simulated)...');
        const { data: foundUser, error: logErr } = await supabase.from('users').select('*').eq('email', email).maybeSingle();

        if (logErr || !foundUser) {
            console.error('❌ Login error: User not found');
            return;
        }

        const match = await bcrypt.compare(password, foundUser.password);
        if (match) {
            console.log('✅ Login successful! Password matches.');
        } else {
            console.error('❌ Login failed! Password mismatch.');
        }

        // Cleanup
        await supabase.from('users').delete().eq('id', user.id);
        console.log('✅ Cleanup done.');
    } catch (err) {
        console.error('❌ Error:', err.message);
    }
}

testFullFlow();
