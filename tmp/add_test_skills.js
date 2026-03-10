require('dotenv').config({ path: 'c:/Users/Asus/Downloads/internai-v5-FINAL/internai-final-project/.env' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function addSkills() {
    const email = 'yoginiade05@gmail.com';
    const skills = ['python', 'react', 'java', 'sql', 'javascript'];
    try {
        const { error } = await supabase.from('users').update({ skills }).eq('email', email);
        if (error) throw error;
        console.log(`✅ Success! Added ${skills.length} skills to ${email}.`);
        console.log('Now refresh your dashboard to see the matches!');
    } catch (err) {
        console.error('❌ Error:', err.message);
    }
}

addSkills();
