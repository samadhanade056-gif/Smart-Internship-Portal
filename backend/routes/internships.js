const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const authMW = require('../middleware/auth');
const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'internai_secret_2025';

// GET /api/internships
router.get('/', async (req, res) => {
  try {
    const { search, domain, location, duration } = req.query;

    // Optional Auth: Try to get user skills for matching
    let userSkills = [];
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.split(' ')[1];
        if (!token.startsWith('demo_token')) {
          const decoded = jwt.verify(token, SECRET);
          const { data: user } = await supabase.from('users').select('skills').eq('id', decoded.id).maybeSingle();
          if (user && user.skills) userSkills = user.skills.map(s => s.toLowerCase());
        } else {
          userSkills = ['python', 'react', 'javascript', 'node.js', 'sql']; // Mock demo skills
        }
      } catch (e) { /* Invalid token, proceed as guest */ }
    }

    let query = supabase.from('internships').select('*').eq('is_active', true);
    if (domain) query = query.eq('domain', domain);
    if (location) query = query.ilike('location', `%${location}%`);
    if (duration) query = query.ilike('duration', `${duration}%`);
    if (search) query = query.or(`title.ilike.%${search}%,company.ilike.%${search}%`);

    const { data: internships, error } = await query;
    if (error) throw error;

    // Calculate match score
    const results = internships.map(intern => {
      const required = (intern.required_skills || []).map(s => s.toLowerCase());
      const matched = required.filter(s => userSkills.includes(s));
      const missing = required.filter(s => !userSkills.includes(s));

      let match_score = 0;
      if (required.length > 0) {
        match_score = Math.round((matched.length / required.length) * 100);
      } else if (userSkills.length > 0) {
        match_score = 30; // Base score if user has skills but none match specifically
      }

      return {
        ...intern,
        match_score,
        matched_skills: (intern.required_skills || []).filter(s => userSkills.includes(s.toLowerCase())),
        missing_skills: (intern.required_skills || []).filter(s => !userSkills.includes(s.toLowerCase()))
      };
    });

    // Sort by match score
    results.sort((a, b) => b.match_score - a.match_score);

    res.json({ success: true, count: results.length, internships: results });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/internships/applied/list  (MUST be before /:id)
router.get('/applied/list', authMW, async (req, res) => {
  try {
    const { data, error } = await supabase.from('applied_internships')
      .select('*, internships(logo, location, stipend, duration, domain)')
      .eq('user_id', req.user.id)
      .order('applied_at', { ascending: false });
    if (error) throw error;
    res.json({ success: true, count: data.length, applications: data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/internships/:id
router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('internships').select('*').eq('id', req.params.id).maybeSingle();
    if (error || !data) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, internship: data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/internships/:id/apply
router.post('/:id/apply', authMW, async (req, res) => {
  try {
    const { id } = req.params;
    const { match_score } = req.body;

    const { data: intern, error: iErr } = await supabase.from('internships').select('*').eq('id', id).maybeSingle();
    if (iErr || !intern) return res.status(404).json({ success: false, message: 'Internship not found' });

    const { data: existing } = await supabase.from('applied_internships')
      .select('id').eq('user_id', req.user.id).eq('internship_id', id).maybeSingle();
    if (existing) return res.status(409).json({ success: false, message: `Already applied to ${intern.company}` });

    const { data: app, error: aErr } = await supabase.from('applied_internships').insert({
      user_id: req.user.id, internship_id: id,
      company: intern.company, title: intern.title,
      logo: intern.logo || '🏢', location: intern.location,
      stipend: intern.stipend, status: 'Applied',
      match_score: match_score || 0
    }).select().single();
    if (aErr) throw aErr;

    res.status(201).json({ success: true, message: `Applied to ${intern.company}! ✅`, application: app });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
