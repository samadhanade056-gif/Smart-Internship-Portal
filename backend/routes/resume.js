const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const authMW = require('../middleware/auth');
const supabase = require('../config/supabase');
const INTERNSHIPS = require('../../database/internships.json');

const UPLOADS_DIR = process.env.VERCEL ? '/tmp' : path.join(__dirname, '../uploads');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(UPLOADS_DIR) && !process.env.VERCEL) {
      try { fs.mkdirSync(UPLOADS_DIR, { recursive: true }); } catch (e) { }
    }
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => cb(null, `resume_${Date.now()}${path.extname(file.originalname)}`)
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    ['.pdf', '.docx', '.txt'].includes(ext) ? cb(null, true) : cb(new Error('Only PDF, DOCX, TXT allowed'));
  }
});

const pdf = require('pdf-parse');

// ── POST /api/resume/analyze ───────────────────────────
router.post('/analyze', authMW, upload.single('resume'), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

  const filePath = req.file.path;
  const originalName = req.file.originalname;
  let resumeText = '';

  try {
    // Read and Extract text from file
    const fileBuffer = fs.readFileSync(filePath);
    const ext = path.extname(originalName).toLowerCase();

    if (ext === '.txt') {
      resumeText = fileBuffer.toString('utf8');
    } else if (ext === '.pdf') {
      try {
        const data = await pdf(fileBuffer);
        resumeText = data.text;
      } catch (e) {
        console.error('PDF parsing error:', e.message);
        // Fallback to binary text extraction
        resumeText = fileBuffer.toString('utf8', 0, fileBuffer.length).replace(/[^\x20-\x7E\n\r\t]/g, ' ');
      }
    } else {
      // DOCX fallback: binary text extraction
      resumeText = fileBuffer.toString('utf8', 0, fileBuffer.length).replace(/[^\x20-\x7E\n\r\t]/g, ' ');
    }

    // Professional Cleanup
    resumeText = resumeText
      .replace(/\s+/g, ' ')
      .replace(/[\n\r\t]/g, ' ')
      .trim();

    if (!resumeText || resumeText.length < 50) {
      throw new Error('Could not extract meaningful text from this file. Is it a scanned image?');
    }

    // Extract skills from actual resume content
    const extractedSkills = extractSkillsFromText(resumeText, originalName);

    // Compute ATS score based on actual content
    const atsResult = computeRealATSScore(resumeText, extractedSkills, originalName);

    // Generate recommendations matching against all 30 companies
    const recommendations = generateRecommendations(extractedSkills.all_skills);

    // ── SAVE TO SUPABASE ──────────────────────────────
    // IMPORTANT: If your upload fails, run this in Supabase SQL Editor:
    // ALTER TABLE users ADD COLUMN resume_text TEXT DEFAULT '';
    const { error: updateError } = await supabase.from('users').update({
      skills: extractedSkills.all_skills,
      ats_score: atsResult.total_score,
      ats_breakdown: atsResult.breakdown,
      // resume_text: resumeText.slice(0, 5000), // Uncomment after running the SQL command above!
      updated_at: new Date().toISOString()
    }).eq('id', req.user.id);

    if (updateError) {
      console.error('Supabase update error:', updateError.message);
    } else {
      console.log(`✅ Saved to Supabase: user ${req.user.id} | skills: ${extractedSkills.all_skills.length} | ATS: ${atsResult.total_score}`);
    }

    fs.unlink(filePath, () => { });

    res.json({
      success: true,
      message: `Found ${extractedSkills.all_skills.length} skills! ATS Score: ${atsResult.total_score}/100`,
      skills: extractedSkills,
      ats_score: atsResult,
      contact: extractedSkills.contact,
      education: extractedSkills.education,
      experience: extractedSkills.experience,
      recommendations
    });

  } catch (err) {
    console.error('Resume analyze error:', err.message);
    if (filePath && fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch (e) { }
    }
    res.status(err.status || 500).json({
      success: false,
      message: 'Analysis failed: ' + (err.message || 'Unknown server error')
    });
  }
});

// ── GET /api/resume/skills ─────────────────────────────
router.get('/skills', authMW, async (req, res) => {
  try {
    const { data: user, error } = await supabase.from('users')
      .select('skills,ats_score,ats_breakdown').eq('id', req.user.id).single();
    if (error) throw error;
    res.json({ success: true, skills: user?.skills || [], ats_score: user?.ats_score || 0, ats_breakdown: user?.ats_breakdown || null });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────
//  SKILL EXTRACTION — reads actual file content
// ─────────────────────────────────────────────────────────
function extractSkillsFromText(text, filename) {
  const t = text.toLowerCase();
  const fn = filename.toLowerCase();

  const SKILL_DICT = {
    programming_languages: [
      'python', 'java', 'javascript', 'typescript', 'c++', 'c#', 'c', 'golang', 'go', 'rust', 'kotlin',
      'swift', 'php', 'ruby', 'scala', 'r', 'matlab', 'dart', 'bash', 'shell', 'perl', 'haskell'
    ],
    web_frontend: [
      'react', 'angular', 'vue', 'next.js', 'nuxt', 'html', 'css', 'sass', 'tailwind', 'bootstrap',
      'webpack', 'vite', 'jquery', 'redux', 'graphql', 'typescript', 'figma', 'storybook', 'svelte'
    ],
    web_backend: [
      'node.js', 'express', 'django', 'flask', 'fastapi', 'spring boot', 'spring', 'laravel',
      'rails', 'asp.net', '.net', 'rest api', 'graphql', 'grpc', 'microservices', 'rabbitmq', 'celery'
    ],
    ai_ml: [
      'machine learning', 'deep learning', 'tensorflow', 'pytorch', 'keras', 'scikit-learn',
      'pandas', 'numpy', 'matplotlib', 'seaborn', 'nlp', 'computer vision', 'opencv', 'transformers',
      'huggingface', 'bert', 'gpt', 'llm', 'langchain', 'mlflow', 'statistics', 'data science',
      'neural network', 'reinforcement learning', 'xgboost', 'lightgbm'
    ],
    databases: [
      'sql', 'mysql', 'postgresql', 'mongodb', 'redis', 'sqlite', 'firebase', 'cassandra',
      'elasticsearch', 'supabase', 'oracle', 'dynamodb', 'neo4j', 'influxdb', 'hbase'
    ],
    cloud_devops: [
      'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'terraform', 'jenkins', 'github actions',
      'ci/cd', 'ansible', 'prometheus', 'grafana', 'linux', 'bash', 'shell scripting',
      'nginx', 'apache', 'serverless', 'lambda', 's3', 'ec2', 'azure devops', 'helm'
    ],
    mobile: [
      'android', 'ios', 'react native', 'flutter', 'kotlin', 'swift', 'xcode', 'jetpack compose',
      'firebase', 'room database', 'mvvm', 'dart', 'objective-c', 'swiftui', 'expo'
    ],
    data_engineering: [
      'spark', 'hadoop', 'kafka', 'airflow', 'dbt', 'hive', 'presto', 'snowflake', 'bigquery',
      'databricks', 'etl', 'data pipeline', 'data warehouse', 'flink', 'nifi'
    ],
    cybersecurity: [
      'ethical hacking', 'penetration testing', 'owasp', 'kali linux', 'burp suite', 'nmap',
      'wireshark', 'siem', 'soc', 'firewalls', 'vpn', 'encryption', 'ssl', 'zero trust'
    ],
    tools_other: [
      'git', 'jira', 'agile', 'scrum', 'linux', 'windows', 'postman', 'swagger', 'unit testing',
      'jest', 'selenium', 'cypress', 'figma', 'tableau', 'power bi', 'excel', 'github', 'gitlab'
    ]
  };

  const found = {};
  const allFound = new Set();

  for (const [cat, skills] of Object.entries(SKILL_DICT)) {
    found[cat] = [];
    for (const skill of skills) {
      if (t.includes(skill) || fn.includes(skill.replace('.', '').replace(' ', ''))) {
        if (!allFound.has(skill)) {
          allFound.add(skill);
          // Assign confidence based on frequency in text
          const count = (t.match(new RegExp(skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
          const conf = Math.min(0.98, 0.65 + count * 0.08);
          found[cat].push({ skill, confidence: parseFloat(conf.toFixed(2)) });
        }
      }
    }
  }

  // Extract contact info
  const emailMatch = text.match(/[\w.-]+@[\w.-]+\.\w{2,}/);
  const phoneMatch = text.match(/(\+91[\s-]?)?[6-9]\d{9}|(\+1[\s-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/);
  const linkedinMatch = text.match(/linkedin\.com\/in\/[\w-]+/i);
  const githubMatch = text.match(/github\.com\/[\w-]+/i);

  // Education detection
  const degreeMap = {
    'b.tech': 'B.Tech', 'btech': 'B.Tech', 'b.e.': 'B.E', 'mtech': 'M.Tech',
    'm.tech': 'M.Tech', 'mca': 'MCA', 'bca': 'BCA', 'bsc': 'B.Sc', 'msc': 'M.Sc',
    'b.sc': 'B.Sc', 'm.sc': 'M.Sc', 'phd': 'PhD', 'mba': 'MBA'
  };
  let degree = 'Unknown';
  for (const [key, val] of Object.entries(degreeMap)) {
    if (t.includes(key)) { degree = val; break; }
  }
  const fieldMap = ['computer science', 'computer engineering', 'information technology', 'electronics',
    'electrical', 'mechanical', 'civil', 'data science', 'ai', 'artificial intelligence'];
  let field = 'Unknown';
  for (const f of fieldMap) {
    if (t.includes(f)) { field = f.split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join(' '); break; }
  }
  const gpaMatch = text.match(/(\d\.\d{1,2})\s*(\/\s*10|\/\s*4|cgpa|sgpa|gpa)/i) ||
    text.match(/(cgpa|sgpa|gpa)[:\s]+(\d\.\d{1,2})/i);

  // Experience detection
  const expKeywords = ['intern', 'experience', 'worked', 'developed', 'implemented', 'built', 'created',
    'designed', 'engineer', 'developer', 'led', 'managed'];
  let expCount = 0;
  for (const kw of expKeywords) { if (t.includes(kw)) expCount++; }
  const yearMatch = text.match(/(\d+)\s*(year|yr)s?\s*(of\s*)?(experience|exp)/i);

  return {
    all_skills: [...allFound],
    total_skills_found: allFound.size,
    by_category: found,
    contact: {
      email: emailMatch ? emailMatch[0] : null,
      phone: phoneMatch ? phoneMatch[0] : null,
      linkedin: linkedinMatch ? linkedinMatch[0] : null,
      github: githubMatch ? githubMatch[0] : null
    },
    education: {
      degree_level: degree,
      field_of_study: field,
      gpa: gpaMatch ? parseFloat(gpaMatch[1] || gpaMatch[2]) : null
    },
    experience: {
      estimated_years: yearMatch ? parseInt(yearMatch[1]) : 0,
      experience_level: expCount >= 5 ? 'Experienced' : expCount >= 2 ? 'Fresher+Projects' : 'Fresher',
      roles_detected: expCount
    }
  };
}

// ─────────────────────────────────────────────────────────
//  REAL ATS SCORING — varies per resume content
// ─────────────────────────────────────────────────────────
function computeRealATSScore(text, extracted, filename) {
  const t = text.toLowerCase();
  const breakdown = {};

  // 1. Skills Richness (max 35 pts)
  const skillCount = extracted.all_skills.length;
  const skillScore = skillCount >= 15 ? 35 : skillCount >= 10 ? 28 : skillCount >= 6 ? 20 : skillCount >= 3 ? 12 : Math.max(2, skillCount * 3);
  breakdown.skills = { score: skillScore, max: 35, label: 'Skills Richness' };

  // 2. Contact Info (max 20 pts)
  let contactScore = 0;
  if (extracted.contact.email) contactScore += 8;
  if (extracted.contact.phone) contactScore += 5;
  if (extracted.contact.linkedin) contactScore += 5;
  if (extracted.contact.github) contactScore += 2;
  breakdown.contact = { score: contactScore, max: 20, label: 'Contact Info' };

  // 3. Education (max 15 pts)
  let eduScore = 0;
  if (extracted.education.degree_level !== 'Unknown') eduScore += 8;
  if (extracted.education.field_of_study !== 'Unknown') eduScore += 5;
  if (extracted.education.gpa) eduScore += 2;
  breakdown.education = { score: eduScore, max: 15, label: 'Education' };

  // 4. Experience / Projects (max 20 pts)
  const sections = ['experience', 'project', 'internship', 'work', 'achievement', 'certification', 'award'];
  let sectionCount = 0;
  for (const s of sections) { if (t.includes(s)) sectionCount++; }
  const expScore = Math.min(20, sectionCount * 3 + extracted.experience.roles_detected);
  breakdown.experience = { score: expScore, max: 20, label: 'Experience & Projects' };

  // 5. Resume Length / Completeness (max 10 pts)
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const lenScore = wordCount >= 400 ? 10 : wordCount >= 200 ? 7 : wordCount >= 100 ? 4 : 1;
  breakdown.completeness = { score: lenScore, max: 10, label: 'Resume Completeness' };

  const total = Object.values(breakdown).reduce((s, b) => s + b.score, 0);
  const clamped = Math.min(100, Math.max(1, total));
  const grade = clamped >= 85 ? 'A+' : clamped >= 75 ? 'A' : clamped >= 65 ? 'B' : clamped >= 50 ? 'C' : clamped >= 35 ? 'D' : 'F';
  const tip = clamped >= 75 ? 'Excellent resume!' : clamped >= 55 ? 'Good, add more skills.' : clamped >= 35 ? 'Add contact info & projects.' : 'Resume needs significant improvement.';

  console.log(`ATS Score: ${clamped} | Skills:${skillScore} Contact:${contactScore} Edu:${eduScore} Exp:${expScore} Len:${lenScore}`);
  return { total_score: clamped, grade, tip, breakdown };
}

// ─────────────────────────────────────────────────────────
//  RECOMMENDATIONS — match against all 30 companies
// ─────────────────────────────────────────────────────────
function generateRecommendations(studentSkills) {
  const studentSet = new Set(studentSkills.map(s => s.toLowerCase()));

  const scored = INTERNSHIPS.map(intern => {
    const req = (intern.required_skills || []).map(s => s.toLowerCase());
    const pref = (intern.preferred_skills || []).map(s => s.toLowerCase());
    const matchReq = req.filter(s => studentSet.has(s));
    const matchPref = pref.filter(s => studentSet.has(s));
    const missReq = req.filter(s => !studentSet.has(s));

    const reqScore = req.length ? (matchReq.length / req.length) * 70 : 0;
    const prefScore = pref.length ? (matchPref.length / pref.length) * 30 : 0;
    const total = Math.min(100, Math.round(reqScore + prefScore));

    return {
      id: intern.id, title: intern.title, company: intern.company,
      logo: intern.logo || '🏢', location: intern.location, duration: intern.duration,
      stipend: intern.stipend, domain: intern.domain,
      match_score: total,
      matched_skills: matchReq,
      missing_skills: missReq,
      description: intern.description,
      apply_link: intern.apply_link || '#',
      recommendation: total >= 80 ? '🟢 Excellent match!' : total >= 60 ? '🟡 Good match.' : total >= 40 ? '🟠 Moderate match.' : '🔴 Low match.'
    };
  });

  scored.sort((a, b) => b.match_score - a.match_score);
  scored.forEach((s, i) => s.rank = i + 1);

  const topMatch = scored[0];
  return {
    student_skills: studentSkills,
    total_analyzed: INTERNSHIPS.length,
    matches_found: scored.filter(s => s.match_score >= 20).length,
    top_recommendations: scored.filter(s => s.match_score >= 20).slice(0, 12),
    all_sorted: scored,
    skill_gap: topMatch ? {
      internship_title: topMatch.title,
      company: topMatch.company,
      match_score: topMatch.match_score,
      strengths: topMatch.matched_skills,
      missing_critical: topMatch.missing_skills.slice(0, 6)
    } : null
  };
}

module.exports = router;
