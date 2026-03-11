const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();
require('./config/supabase');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../frontend')));

const os = require('os');
const uploadsDir = process.env.VERCEL ? '/tmp' : path.join(__dirname, 'uploads');

if (!fs.existsSync(uploadsDir) && !process.env.VERCEL) {
  try {
    fs.mkdirSync(uploadsDir, { recursive: true });
  } catch (err) {
    console.warn('⚠️ Could not create uploads dir, using OS temp dir fallback:', err.message);
  }
}

app.use('/api/auth', require('./routes/auth'));
app.use('/api/resume', require('./routes/resume'));
app.use('/api/internships', require('./routes/internships'));
app.use('/api/dashboard', require('./routes/dashboard'));

app.get('/api/health', (_, res) => res.json({ status: 'ok', version: '5.0.0' }));

app.get('*', (_, res) => res.sendFile(path.join(__dirname, '../frontend/index.html')));

// Global Error Handler
app.use((err, req, res, next) => {
  const status = err.status || 500;
  console.error(`[ERROR] ${req.method} ${req.url} | Status: ${status} | Message: ${err.message}`);
  if (err.stack) console.error(err.stack);
  
  res.status(status).json({ 
    success: false, 
    message: err.message || 'Internal Server Error',
    type: err.name || 'Error'
  });
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

app.listen(PORT, () => {
  console.log(`\n🚀 InternAI v5.0 → http://localhost:${PORT}`);
  console.log(`   ✅ Real ATS scoring | Profile page | DB sync\n`);
});
