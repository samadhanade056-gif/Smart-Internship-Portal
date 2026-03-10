const express = require('express');
const router = express.Router();
const authMW = require('../middleware/auth');
const supabase = require('../config/supabase');

router.get('/', authMW, async (req, res) => {
  try {
    const [userRes, appliedRes, internshipRes] = await Promise.all([
      supabase.from('users').select('name,email,college,branch,skills,ats_score,ats_breakdown,avatar_color').eq('id', req.user.id).maybeSingle(),
      supabase.from('applied_internships').select('*').eq('user_id', req.user.id),
      supabase.from('internships').select('required_skills').eq('is_active', true)
    ]);
    const user = userRes.data || {};
    const applied = appliedRes.data || [];
    const interns = internshipRes.data || [];

    // Calculate matches based on skills
    const userSkills = (user.skills || []).map(s => s.toLowerCase());
    let matchesCount = 0;
    if (userSkills.length > 0) {
      interns.forEach(i => {
        const reqSkills = (i.required_skills || []).map(s => s.toLowerCase());
        const common = reqSkills.filter(s => userSkills.some(us => us.includes(s) || s.includes(us)));
        if (common.length >= 1) matchesCount++;
      });
    }

    res.json({
      success: true,
      stats: { total_skills: userSkills.length, ats_score: user.ats_score || 0, applied: applied.length, matches: matchesCount },
      user, applications: applied
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
