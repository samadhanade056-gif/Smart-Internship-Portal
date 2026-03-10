const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');
require('dotenv').config();
require('./config/supabase');

const app  = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../frontend')));

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

app.use('/api/auth',        require('./routes/auth'));
app.use('/api/resume',      require('./routes/resume'));
app.use('/api/internships', require('./routes/internships'));
app.use('/api/dashboard',   require('./routes/dashboard'));

app.get('/api/health', (_, res) => res.json({ status: 'ok', version: '5.0.0', companies: 30 }));

app.get('*', (_, res) => res.sendFile(path.join(__dirname, '../frontend/index.html')));

app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.status(err.status || 500).json({ success: false, message: err.message });
});

app.listen(PORT, () => {
  console.log(`\n🚀 InternAI v5.0 → http://localhost:${PORT}`);
  console.log(`   ✅ 30 companies | Real ATS scoring | Profile page\n`);
});
