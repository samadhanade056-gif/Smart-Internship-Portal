require('dotenv').config({ path: 'c:/Users/Asus/Downloads/internai-v5-FINAL/internai-final-project/.env' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function checkUserSkills() {
    const email = 'yoginiade05@gmail.com';
    try {
        const { data: user, error } = await supabase.from('users').select('skills').eq('email', email).maybeSingle();
        if (error) throw error;
        console.log(`User: ${email}`);
        console.log(`Skills: ${JSON.stringify(user?.skills || [])}`);
    } catch (err) {
        console.error('❌ Error:', err.message);
    }
}

checkUserSkills();
