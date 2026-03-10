const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const router = express.Router();
const supabase = require('../config/supabase');
const authMW = require('../middleware/auth');
const SECRET = process.env.JWT_SECRET || 'internai_secret_2025';

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, college, branch, mobile } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ success: false, message: 'Name, email and password are required' });
    if (password.length < 8)
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });

    const { data: existing } = await supabase.from('users').select('id').eq('email', email.toLowerCase().trim()).maybeSingle();
    if (existing) return res.status(409).json({ success: false, message: 'Email already registered. Please login.' });

    const hashed = await bcrypt.hash(password, 10);
    const colors = ['#10b981', '#6366f1', '#f59e0b', '#ec4899', '#3b82f6', '#8b5cf6'];
    const avatar_color = colors[Math.floor(Math.random() * colors.length)];

    const { data: user, error } = await supabase.from('users').insert({
      name: name.trim(), email: email.toLowerCase().trim(), password: hashed,
      college: (college || '').trim(), branch: (branch || '').trim(),
      mobile: (mobile || '').trim(), avatar_color
    }).select('id,name,email,college,branch,mobile,skills,ats_score,avatar_color,created_at').single();

    if (error) { console.error('Register error:', error); throw error; }

    const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, SECRET, { expiresIn: '7d' });
    res.status(201).json({ success: true, token, user });
  } catch (err) {
    console.error('Register catch:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, message: 'Email and password required' });

    const { data: user, error } = await supabase.from('users').select('*').eq('email', email.toLowerCase().trim()).maybeSingle();
    if (error) throw error;
    if (!user) return res.status(401).json({ success: false, message: 'No account with this email. Please register.' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ success: false, message: 'Wrong password. Please try again.' });

    const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, SECRET, { expiresIn: '7d' });
    const { password: _, ...safeUser } = user;
    res.json({ success: true, token, user: safeUser });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/auth/me
router.get('/me', authMW, async (req, res) => {
  try {
    const { data: user, error } = await supabase.from('users')
      .select('id,name,email,college,branch,mobile,linkedin,github,bio,skills,ats_score,ats_breakdown,avatar_color,created_at')
      .eq('id', req.user.id).maybeSingle();
    if (error || !user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/auth/profile
router.put('/profile', authMW, async (req, res) => {
  try {
    const { name, college, branch, mobile, linkedin, github, bio } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name.trim();
    if (college !== undefined) updates.college = college.trim();
    if (branch !== undefined) updates.branch = branch.trim();
    if (mobile !== undefined) updates.mobile = mobile.trim();
    if (linkedin !== undefined) updates.linkedin = linkedin.trim();
    if (github !== undefined) updates.github = github.trim();
    if (bio !== undefined) updates.bio = bio.trim();
    updates.updated_at = new Date().toISOString();

    const { data: user, error } = await supabase.from('users')
      .update(updates).eq('id', req.user.id)
      .select('id,name,email,college,branch,mobile,linkedin,github,bio,skills,ats_score,avatar_color').single();
    if (error) throw error;
    res.json({ success: true, user, message: 'Profile updated!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/auth/password
router.put('/password', authMW, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ success: false, message: 'All fields required' });
    if (newPassword.length < 8) return res.status(400).json({ success: false, message: 'New password must be at least 8 chars' });

    // Fetch user hash
    const { data: user, error } = await supabase.from('users').select('password').eq('id', req.user.id).single();
    if (error || !user) throw new Error('User not found');

    // Verify current
    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) return res.status(401).json({ success: false, message: 'Current password incorrect' });

    // Hash new
    const hashed = await bcrypt.hash(newPassword, 10);
    const { error: updErr } = await supabase.from('users').update({ password: hashed }).eq('id', req.user.id);
    if (updErr) throw updErr;

    res.json({ success: true, message: 'Password updated successfully! 🔒' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
