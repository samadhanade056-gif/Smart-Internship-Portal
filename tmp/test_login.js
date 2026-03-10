require('dotenv').config({ path: 'c:/Users/Asus/Downloads/internai-v5-FINAL/internai-final-project/.env' });
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const URL = 'http://localhost:5000/api';

async function testLogin() {
    const email = 'ieshu_' + Date.now() + '@gmail.com';
    const password = 'password123';

    try {
        console.log('1. Registering ' + email + '...');
        const regRes = await fetch(URL + '/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Ieshu Test', email, password })
        });
        const regData = await regRes.json();
        console.log('Register Res:', regData);

        if (!regRes.ok) throw new Error('Register failed: ' + regData.message);

        console.log('2. Logging in...');
        const logRes = await fetch(URL + '/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const logData = await logRes.json();
        console.log('Login Res:', logData);

        if (logRes.ok) {
            console.log('✅ Full login flow works!');
        } else {
            console.error('❌ Login failed!');
        }
    } catch (err) {
        console.error('❌ Error:', err.message);
    }
}

testLogin();
