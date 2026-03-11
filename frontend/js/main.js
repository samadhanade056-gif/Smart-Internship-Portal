/* ══════════════════════════════════════════════════════════
   InternAI v5 — Main JS
══════════════════════════════════════════════════════════ */
const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') ? 'http://localhost:5000/api' : '/api';

function showToast(msg, type = 'success') {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.innerHTML = '<span class="toast-dot"></span><span class="toast-msg"></span>'; document.body.appendChild(t); }
  t.querySelector('.toast-dot').style.background = type === 'success' ? '#10b981' : '#ef4444';
  t.querySelector('.toast-msg').textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3500);
}
function getToken() { return localStorage.getItem('intern_token'); }
function setToken(t) { localStorage.setItem('intern_token', t); }
function getUser() { return JSON.parse(localStorage.getItem('intern_user') || 'null'); }
function setUser(u) { localStorage.setItem('intern_user', JSON.stringify(u)); }
function logout() { localStorage.removeItem('intern_token'); localStorage.removeItem('intern_user'); window.location.href = '/pages/login.html'; }

async function apiFetch(path, opts = {}) {
  const token = getToken();
  if (token && token.startsWith('demo_token')) {
    if (path === '/dashboard') return { success: true, stats: { total_skills: 12, matches: 8, ats_score: 85, applied: 2 }, user: { name: 'Demo Student', avatar_color: '#10b981' } };
    if (path.startsWith('/internships')) return { success: true, internships: [{ id: 'DEMO1', title: 'AI Developer Intern', company: 'Google (Demo)', logo: '🔍', location: 'Remote', duration: '3 months', stipend: '₹90,000/mo', match_score: 92, matched_skills: ['Python', 'React'], missing_skills: ['Go'] }, { id: 'DEMO2', title: 'Full Stack Intern', company: 'Amazon (Demo)', logo: '🛒', location: 'Bangalore', duration: '6 months', stipend: '₹80,000/mo', match_score: 78, matched_skills: ['Javascript', 'Node.js'], missing_skills: ['AWS'] }] };
    return { success: true, message: 'Demo Success' };
  }
  
  try {
    const res = await fetch(API_BASE + path, {
      headers: { 
        'Content-Type': 'application/json', 
        ...(token ? { Authorization: `Bearer ${token}` } : {}), 
        ...(opts.headers || {}) 
      },
      ...opts
    });
    
    const contentType = res.headers.get('content-type');
    let data;
    
    if (contentType && contentType.includes('application/json')) {
      data = await res.json();
    } else {
      const text = await res.text();
      console.error('Non-JSON response:', text.slice(0, 200));
      throw new Error(`Server returned an invalid response. ${res.status === 500 ? 'Internal Server Error' : 'Status: ' + res.status}`);
    }

    if (!res.ok) throw new Error(data.message || `Request failed (HTTP ${res.status})`);
    return data;
  } catch (err) {
    if (err.message.includes('Failed to fetch')) throw new Error('Could not connect to server. Please check your internet or try again later.');
    throw err;
  }
}

// Hamburger & Mobile Nav
const hamburger = document.getElementById('hamburger');
if (hamburger) {
  hamburger.addEventListener('click', () => {
    const sb = document.getElementById('sidebar');
    if (sb) {
      const isOpen = sb.classList.toggle('open');
      document.body.style.overflow = (isOpen && window.innerWidth <= 1024) ? 'hidden' : '';
    }
  });
}

// Close sidebar on link click (mobile)
document.addEventListener('click', e => {
  const sb = document.getElementById('sidebar');
  if (sb && sb.classList.contains('open') && window.innerWidth <= 1024) {
    if (e.target.closest('.sidebar-link')) {
      sb.classList.remove('open');
      document.body.style.overflow = '';
    }
  }
});


function requireAuth() { if (!getToken()) { window.location.href = '/pages/login.html'; return false; } return true; }

function animateCounter(el, target, suffix = '') {
  let cur = 0; const step = target / 50;
  const tmr = setInterval(() => { cur += step; if (cur >= target) { cur = target; clearInterval(tmr); } el.textContent = Math.floor(cur) + suffix; }, 25);
}

function initUploadZone(zoneId, inputId, onFile) {
  const zone = document.getElementById(zoneId), input = document.getElementById(inputId);
  if (!zone || !input) return;
  zone.addEventListener('click', () => input.click());
  input.addEventListener('change', () => { if (input.files[0]) onFile(input.files[0]); });
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('dragover'); const f = e.dataTransfer.files[0]; if (f) onFile(f); });
}

async function uploadResume(file) {
  const zone = document.getElementById('uploadZone');
  if (!zone) return;
  const token = getToken();
  if (!token) { zone.innerHTML = `<div class="upload-icon" style="background:rgba(239,68,68,.1)"><svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 9v4M12 17h.01M12 3l9 16H3L12 3z" stroke="#ef4444" stroke-width="1.8" stroke-linecap="round"/></svg></div><h3>Not logged in</h3><p>Please login to upload.</p><a href="/pages/login.html" style="display:inline-block;margin-top:12px;padding:10px 24px;background:#10b981;color:#fff;border-radius:8px;font-weight:600;">Login Now</a>`; showToast('Please login first!', 'error'); return; }
  zone.innerHTML = `<div class="spinner"></div><p style="margin-top:16px;color:#8fa3c0">Reading your resume with AI...</p>`;
  try {
    const fd = new FormData(); fd.append('resume', file);
    const res = await fetch(API_BASE + '/resume/analyze', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
    let data;
    try {
      data = await res.json();
    } catch (e) {
      throw new Error('Server returned an invalid response (not JSON). ' + (res.status === 500 ? 'This is likely a server crash.' : 'Status: ' + res.status));
    }

    if (res.status === 401) { localStorage.clear(); zone.innerHTML = `<h3>Session expired</h3><a href="/pages/login.html" style="color:#10b981">Login again</a>`; return; }
    if (!res.ok) throw new Error(data.message || 'Analysis failed (HTTP ' + res.status + ')');
    zone.innerHTML = `<div class="upload-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M9 12l2 2 4-4" stroke="#10b981" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="12" r="9" stroke="#10b981" stroke-width="1.5"/></svg></div><h3>✅ ${file.name}</h3><p style="color:#34d399;font-weight:600">${data.skills?.total_skills_found || 0} skills found · ATS Score: <strong>${data.ats_score?.total_score || 0}/100</strong></p>`;
    showToast(`Resume analyzed! ${data.skills?.total_skills_found || 0} skills found 🎉`);
    renderResults(data);
    const rs = document.getElementById('resultsSection'); if (rs) { rs.style.display = 'block'; setTimeout(() => rs.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200); }
  } catch (err) {
    zone.innerHTML = `<div class="upload-icon" style="background:rgba(239,68,68,.1)"><svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 9v4M12 17h.01" stroke="#ef4444" stroke-width="1.8" stroke-linecap="round"/></svg></div><h3>Upload failed</h3><p>${err.message}</p><span class="btn-upload" onclick="location.reload()">Try Again</span>`;
    showToast(err.message, 'error');
  }
}

function renderResults(data) {
  // Stats
  const skills = data.skills?.total_skills_found || 0, ats = data.ats_score?.total_score || 0;
  const recs = (data.recommendations?.top_recommendations || []).length;
  ['statSkills', 'statMatches', 'statScore'].forEach((id, i) => {
    const el = document.getElementById(id);
    if (el) animateCounter(el, [skills, recs, ats][i], id === 'statScore' ? '/100' : '');
  });

  // Recommendations grid
  const grid = document.getElementById('recommendationsGrid');
  if (grid && data.recommendations) {
    const items = data.recommendations.top_recommendations || [];
    grid.innerHTML = items.length ? items.map(r => renderInternCard(r)).join('') : '<p style="color:#8fa3c0;grid-column:span 2;text-align:center;padding:40px">Upload a more detailed resume to see matches.</p>';
  }

  // Skills panel
  const body = document.querySelector('.skills-panel-body');
  if (body && data.skills) {
    const cats = data.skills.by_category || {};
    const CAT_COLORS = { 'programming_languages': '#10b981', 'web_frontend': '#3b82f6', 'web_backend': '#14b8a6', 'databases': '#f97316', 'ai_ml': '#8b5cf6', 'cloud_devops': '#22c55e', 'mobile': '#ec4899', 'data_engineering': '#f59e0b', 'cybersecurity': '#ef4444', 'tools_other': '#94a3b8' };
    let html = '';
    for (const [cat, items] of Object.entries(cats)) {
      if (!items || !items.length) continue;
      const label = cat.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const color = CAT_COLORS[cat] || '#94a3b8';
      html += `<div class="skill-category"><h4>${label}</h4><div class="skill-tags">${items.slice(0, 12).map(i => `<span class="skill-tag" style="background:${color}18;color:${color};border:1px solid ${color}28">${i.skill} <span class="skill-conf">${Math.round(i.confidence * 100)}%</span></span>`).join('')}</div></div>`;
    }
    body.innerHTML = html || '<p style="color:#8fa3c0">No skills detected. Upload a more detailed resume.</p>';
  }

  // ATS score
  const atsEl = document.getElementById('atsScore');
  if (atsEl && data.ats_score) {
    atsEl.textContent = data.ats_score.total_score + '/100';
    const gEl = document.getElementById('atsGrade'); if (gEl) gEl.textContent = data.ats_score.grade;
    const tipEl = document.getElementById('atsTip'); if (tipEl) tipEl.textContent = data.ats_score.tip || '';
    const bd = data.ats_score.breakdown || {};
    for (const [key, val] of Object.entries(bd)) {
      const progEl = document.getElementById('prog-' + key);
      if (progEl) setTimeout(() => { progEl.style.width = Math.round((val.score / val.max) * 100) + '%'; }, 400);
      const lblEl = document.getElementById('val-' + key);
      if (lblEl) lblEl.textContent = `${val.score}/${val.max}`;
    }
  }

  // Gap analysis
  const gap = data.recommendations?.skill_gap;
  if (gap) {
    const gapList = document.getElementById('gapList');
    if (gapList) gapList.innerHTML = (gap.missing_critical || []).map(s => `<div class="gap-item"><span class="gap-skill">❌ ${s}</span><a href="https://www.coursera.org/search?query=${s}" target="_blank" class="gap-learn">Learn on Coursera →</a></div>`).join('') || '<p style="color:#8fa3c0">No missing skills for top match!</p>';
    const sl = document.getElementById('strengthList');
    if (sl) sl.innerHTML = (gap.strengths || []).map(s => `<span class="chip chip--green">${s}</span>`).join('');
    const gapTitle = document.getElementById('gapTitle');
    if (gapTitle) gapTitle.textContent = `Gap Analysis — ${gap.company} (${gap.match_score}% match)`;
  }
}

function renderInternCard(r) {
  const logo = r.logo || '🏢';
  const matchColor = r.match_score >= 70 ? '#10b981' : r.match_score >= 50 ? '#f59e0b' : '#ef4444';
  const matched = (r.matched_skills || []).slice(0, 3);
  const missing = (r.missing_skills || []).slice(0, 2);
  const rData = JSON.stringify(r).replace(/"/g, '&quot;');
  return `<div class="intern-card" onclick="openModal(${rData})">
    <div class="intern-card-top">
      <div class="intern-logo">${logo}</div>
      <div style="flex:1">
        <div class="intern-title">${r.title}</div>
        <div class="intern-company">${r.company} · ${r.location}</div>
      </div>
      <span style="font-size:.72rem;font-weight:700;color:${matchColor};background:${matchColor}18;padding:3px 10px;border-radius:6px;flex-shrink:0">${r.match_score}%</span>
    </div>
    <div class="intern-meta">
      <span class="meta-tag">📍 ${r.location}</span>
      <span class="meta-tag">⏱ ${r.duration}</span>
      <span class="meta-tag" style="color:#10b981">💰 ${r.stipend}</span>
    </div>
    <div class="intern-skills">
      ${matched.map(s => `<span class="chip chip--green">✓ ${s}</span>`).join('')}
      ${missing.map(s => `<span class="chip chip--red">✗ ${s}</span>`).join('')}
    </div>
    <div class="intern-card-bottom">
      <div class="match-score"><div class="match-bar"><div class="match-fill" style="width:${r.match_score}%"></div></div><span class="match-pct">${r.match_score}%</span></div>
      <button class="btn-apply" id="apply-btn-${r.id}" onclick="event.stopPropagation();applyNow('${r.id}',${r.match_score})">Apply Now</button>
    </div>
  </div>`;
}

function openModal(r) {
  const overlay = document.getElementById('modal');
  if (!overlay) return;
  const content = document.getElementById('modalContent');
  content.innerHTML = `
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:20px">
      <span style="font-size:2rem">${r.logo || '🏢'}</span>
      <div><h2 style="font-size:1.2rem;font-weight:800">${r.title}</h2><p style="color:#8fa3c0;font-size:.875rem">${r.company} · ${r.location}</p></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px">
      <div style="background:#1a2337;border-radius:10px;padding:14px"><div style="font-size:.7rem;color:#8fa3c0;margin-bottom:4px">DURATION</div><div style="font-weight:700">${r.duration}</div></div>
      <div style="background:#1a2337;border-radius:10px;padding:14px"><div style="font-size:.7rem;color:#8fa3c0;margin-bottom:4px">STIPEND</div><div style="font-weight:700;color:#10b981">${r.stipend}</div></div>
      <div style="background:#1a2337;border-radius:10px;padding:14px"><div style="font-size:.7rem;color:#8fa3c0;margin-bottom:4px">MATCH SCORE</div><div style="font-weight:700;color:#34d399">${r.match_score}%</div></div>
      <div style="background:#1a2337;border-radius:10px;padding:14px"><div style="font-size:.7rem;color:#8fa3c0;margin-bottom:4px">RANK</div><div style="font-weight:700">#${r.rank || '—'}</div></div>
    </div>
    ${r.description ? `<p style="font-size:.85rem;color:#8fa3c0;margin-bottom:16px;line-height:1.6">${r.description}</p>` : ''}
    <div style="margin-bottom:14px"><h4 style="font-size:.75rem;color:#8fa3c0;text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px">✅ YOUR MATCHING SKILLS</h4><div style="display:flex;flex-wrap:wrap;gap:5px">${(r.matched_skills || []).map(s => `<span class="chip chip--green">${s}</span>`).join('') || '<span style="color:#8fa3c0;font-size:.82rem">None yet — upload resume first</span>'}</div></div>
    <div style="margin-bottom:20px"><h4 style="font-size:.75rem;color:#8fa3c0;text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px">❌ SKILLS TO LEARN</h4><div style="display:flex;flex-wrap:wrap;gap:5px">${(r.missing_skills || []).map(s => `<span class="chip chip--red">${s}</span>`).join('') || '<span style="color:#10b981;font-size:.82rem">You have all required skills! 🎉</span>'}</div></div>
    <button class="btn-full" id="modalApplyBtn" onclick="applyNow('${r.id}',${r.match_score});closeModal()">Apply to ${r.company} →</button>
  `;
  overlay.classList.add('open');
}
function closeModal() { document.getElementById('modal')?.classList.remove('open'); }

async function applyNow(internshipId, matchScore) {
  const token = getToken();
  if (!token) { showToast('Please login first!', 'error'); return; }
  const btn = document.getElementById('apply-btn-' + internshipId);
  if (btn && btn.classList.contains('applied')) { showToast('Already applied!', 'error'); return; }
  try {
    const data = await apiFetch(`/internships/${internshipId}/apply`, { method: 'POST', body: JSON.stringify({ match_score: matchScore || 0 }) });
    showToast(data.message || 'Applied successfully! ✅');
    if (btn) { btn.textContent = 'Applied ✓'; btn.classList.add('applied'); }
    const el = document.getElementById('statApplied'); if (el) el.textContent = (parseInt(el.textContent) || 0) + 1;
  } catch (err) {
    if (err.message.includes('Already applied')) showToast('Already applied to this company', 'error');
    else showToast(err.message, 'error');
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const btn = e.target.querySelector('[type=submit]');
  if (btn) { btn.textContent = 'Logging in...'; btn.disabled = true; }
  try {
    const email = document.getElementById('email').value.trim().toLowerCase();
    const data = await apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ email, password: document.getElementById('password').value }) });
    setToken(data.token); setUser(data.user);
    showToast('Welcome back, ' + data.user.name + '! 👋');
    setTimeout(() => window.location.href = 'dashboard.html', 800);
  } catch (err) {
    showToast(err.message, 'error');
    if (btn) { btn.textContent = 'Login to Dashboard'; btn.disabled = false; }
  }
}

function demoLogin() {
  document.getElementById('email').value = 'demo@internai.com';
  document.getElementById('password').value = 'demo1234';
  setToken('demo_token_2025');
  setUser({ name: 'Demo Student', email: 'demo@internai.com', avatar_color: '#10b981', college: 'Demo University', branch: 'Computer Science' });
  showToast('Demo login successful! 🎉');
  setTimeout(() => window.location.href = 'dashboard.html', 800);
}

async function handleRegister(e) {
  e.preventDefault();
  const btn = e.target.querySelector('[type=submit]'); btn.textContent = 'Creating account...'; btn.disabled = true;
  const pwd = document.getElementById('password').value, cpwd = document.getElementById('confirm_password')?.value;
  if (cpwd && pwd !== cpwd) { showToast('Passwords do not match', 'error'); btn.textContent = 'Create Account Free'; btn.disabled = false; return; }
  try {
    const data = await apiFetch('/auth/register', { method: 'POST', body: JSON.stringify({ name: document.getElementById('name').value, email: document.getElementById('email').value, password: pwd, college: document.getElementById('college')?.value || '', branch: document.getElementById('branch')?.value || '', mobile: document.getElementById('mobile')?.value || '' }) });
    setToken(data.token); setUser(data.user);
    showToast('Account created! Welcome 🎉');
    setTimeout(() => window.location.href = 'dashboard.html', 800);
  } catch (err) { showToast(err.message, 'error'); btn.textContent = 'Create Account Free'; btn.disabled = false; }
}

async function loadDashboard() {
  if (!requireAuth()) return;
  const user = getUser();
  const nameEl = document.getElementById('userName'); if (nameEl && user) nameEl.textContent = user.name?.split(' ')[0] || 'Student';
  try {
    const data = await apiFetch('/dashboard');
    if (data.stats) {
      const el = id => document.getElementById(id);
      if (el('statSkills')) animateCounter(el('statSkills'), data.stats.total_skills || 0);
      if (el('statMatches')) animateCounter(el('statMatches'), data.stats.matches || 0);
      if (el('statScore')) animateCounter(el('statScore'), data.stats.ats_score || 0, '/100');
      if (el('statApplied')) animateCounter(el('statApplied'), data.stats.applied || 0);
    }
  } catch (err) { console.warn('Dashboard load:', err.message); }
}

async function loadInternships(filters = {}) {
  const grid = document.getElementById('allInternshipsGrid'); if (!grid) return;
  grid.innerHTML = '<div class="spinner" style="margin:60px auto"></div>';
  try {
    const qs = new URLSearchParams(filters).toString();
    const data = await apiFetch('/internships' + (qs ? '?' + qs : ''));
    const items = data.internships || [];
    document.getElementById('resultCount').textContent = items.length;
    grid.innerHTML = items.length ? items.map(r => renderInternCard(r)).join('') : '<p style="color:#8fa3c0;text-align:center;padding:60px;grid-column:span 2">No internships found.</p>';
  } catch (err) { grid.innerHTML = `<p style="color:#ef4444;text-align:center;padding:40px">${err.message}</p>`; }
}

window.InternAI = { showToast, logout, uploadResume, handleLogin, demoLogin, handleRegister, loadDashboard, loadInternships, initUploadZone, renderInternCard, openModal, closeModal, applyNow };
