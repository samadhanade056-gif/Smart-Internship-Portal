const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const authMW = require('../middleware/auth');
const supabase = require('../config/supabase');

// Set up memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 4 * 1024 * 1024 }, // 4MB limit
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.pdf', '.docx', '.txt'].includes(ext)) cb(null, true);
    else cb(new Error('Only PDF, DOCX and TXT files are supported.'));
  }
});

// ── HELPERS (moved inside or made super safe) ────────────

function getInternships() {
  try {
    const data = fs.readFileSync(path.join(__dirname, '../../database/internships.json'), 'utf8');
    return JSON.parse(data);
  } catch (e) {
    console.error('[RESUME] Failed to load internships DB:', e.message);
    return [];
  }
}

// ── POST /api/resume/analyze ───────────────────────────
router.post('/analyze', authMW, upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

    const originalName = req.file.originalname;
    const fileBuffer = req.file.buffer;
    const ext = path.extname(originalName).toLowerCase();
    let resumeText = '';

    console.log(`[ANALYZING] ${originalName} | ${req.file.size} bytes`);

    // 1. EXTRACT TEXT
    try {
      if (ext === '.txt') {
        resumeText = fileBuffer.toString('utf8');
      } else if (ext === '.pdf') {
        try {
          // Lazy require to avoid startup issues
          const pdf = require('pdf-parse');
          const data = await pdf(fileBuffer);
          resumeText = data.text || '';
        } catch (pdfErr) {
          console.warn('[PDF_FAIL]', pdfErr.message);
          resumeText = fileBuffer.toString('utf8', 0, 8000).replace(/[^\x20-\x7E\n\r\t]/g, ' ');
        }
      } else if (ext === '.docx') {
        try {
          const mammoth = require('mammoth');
          const result = await mammoth.extractRawText({ buffer: fileBuffer });
          resumeText = result.value || '';
        } catch (docxErr) {
          console.warn('[DOCX_FAIL]', docxErr.message);
          resumeText = fileBuffer.toString('utf8', 0, 8000).replace(/[^\x20-\x7E\n\r\t]/g, ' ');
        }
      } else {
        resumeText = fileBuffer.toString('utf8', 0, 8000).replace(/[^\x20-\x7E\n\r\t]/g, ' ');
      }
    } catch (extractErr) {
      console.error('[EXTRACT_FATAL]', extractErr.message);
      resumeText = "Could not extract text. " + originalName;
    }

    // Clean up
    resumeText = (resumeText || '').replace(/\s+/g, ' ').trim();
    if (resumeText.length < 5) resumeText = "Resume content: " + originalName;

    // 2. RUN ANALYSIS
    const extractedSkills = extractSkillsLocally(resumeText, originalName);
    const atsResult = computeATSLocally(resumeText, extractedSkills);
    const internships = getInternships();
    const recommendations = matchInternships(extractedSkills.all_skills, internships);

    // 3. ATTEMPT SAVE (Non-blocking)
    if (supabase) {
      supabase.from('users').update({
        skills: extractedSkills.all_skills,
        ats_score: atsResult.total_score,
        ats_breakdown: atsResult.breakdown,
        updated_at: new Date().toISOString()
      }).eq('id', req.user.id).then(({ error }) => {
        if (error) console.error('[DB_SYNC_ERR]', error.message);
      }).catch(e => console.error('[DB_SYNC_CATCH]', e.message));
    }

    // 4. RESPOND
    return res.json({
      success: true,
      message: 'Analysis successful!',
      skills: extractedSkills,
      ats_score: atsResult,
      recommendations
    });

  } catch (err) {
    console.error('[SERVER_500]', err);
    return res.status(500).json({
      success: false,
      message: 'A server error occurred while processing your resume.',
      debug: err.message
    });
  }
});

// ── REBUILT SAFE FUNCTIONS ──────────────────────────────

function extractSkillsLocally(text, filename) {
  const t = text.toLowerCase();
  const found = new Set();
  const dictionary = {
    'programming': ['python', 'java', 'javascript', 'typescript', 'c++', 'golang', 'rust', 'c#', 'php', 'ruby'],
    'frontend': ['react', 'next.js', 'angular', 'vue', 'html', 'css', 'tailwind', 'bootstrap'],
    'backend': ['node.js', 'express', 'django', 'flask', 'spring', 'laravel', 'sql', 'mongodb'],
    'cloud': ['aws', 'azure', 'gcp', 'docker', 'kubernetes', 'jenkins', 'devops'],
    'ai_ml': ['machine learning', 'tensorflow', 'pytorch', 'nlp', 'computer vision', 'data science'],
    'other': ['git', 'github', 'agile', 'figma', 'postman', 'linux']
  };

  const byCat = {};
  for (const [cat, skills] of Object.entries(dictionary)) {
    byCat[cat] = [];
    skills.forEach(s => {
      if (t.includes(s)) {
        found.add(s);
        byCat[cat].push({ skill: s, confidence: 0.9 });
      }
    });
  }

  return {
    all_skills: [...found],
    total_skills_found: found.size,
    by_category: byCat,
    contact: { email: t.match(/[\w.-]+@[\w.-]+\.\w{2,}/)?.[0] || null },
    education: { degree: t.includes('bachelor') || t.includes('b.tech') ? 'Bachelor' : 'Unknown' }
  };
}

function computeATSLocally(text, extracted) {
  const score = Math.min(100, (extracted.total_skills_found * 10) + (extracted.contact.email ? 20 : 0) + 20);
  return {
    total_score: score,
    grade: score >= 80 ? 'A' : score >= 60 ? 'B' : 'C',
    breakdown: {
      skills: { score: Math.min(40, extracted.total_skills_found * 5), max: 40 },
      contact: { score: extracted.contact.email ? 20 : 0, max: 20 },
      completeness: { score: 20, max: 20 }
    }
  };
}

function matchInternships(userSkills, internships) {
  if (!internships.length) return { top_recommendations: [] };
  const userSet = new Set(userSkills.map(s => s.toLowerCase()));
  
  const scored = internships.map(i => {
    const req = (i.required_skills || []).map(s => s.toLowerCase());
    const matched = req.filter(s => userSet.has(s));
    const score = req.length ? Math.round((matched.length / req.length) * 100) : 30;
    return { ...i, match_score: score, matched_skills: matched, missing_skills: req.filter(s => !userSet.has(s)) };
  });

  return { 
    top_recommendations: scored.sort((a,b) => b.match_score - a.match_score).slice(0, 10),
    matches_found: scored.length
  };
}

module.exports = router;

