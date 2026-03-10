-- =============================================
--  InternAI v5 - Run this in Supabase SQL Editor
--  STEP 1: Copy ALL this, paste in SQL Editor, click Run
-- =============================================

DROP TABLE IF EXISTS applied_internships CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS internships CASCADE;

CREATE TABLE users (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password      TEXT NOT NULL,
  college       TEXT DEFAULT '',
  branch        TEXT DEFAULT '',
  mobile        TEXT DEFAULT '',
  linkedin      TEXT DEFAULT '',
  github        TEXT DEFAULT '',
  bio           TEXT DEFAULT '',
  skills        TEXT[] DEFAULT '{}',
  ats_score     INTEGER DEFAULT 0,
  ats_breakdown JSONB DEFAULT NULL,
  resume_text   TEXT DEFAULT '',
  avatar_color  TEXT DEFAULT '#10b981',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE internships (
  id               TEXT PRIMARY KEY,
  title            TEXT NOT NULL,
  company          TEXT NOT NULL,
  logo             TEXT DEFAULT '🏢',
  location         TEXT NOT NULL,
  duration         TEXT NOT NULL,
  stipend          TEXT DEFAULT 'Unpaid',
  domain           TEXT NOT NULL,
  required_skills  TEXT[] DEFAULT '{}',
  preferred_skills TEXT[] DEFAULT '{}',
  description      TEXT DEFAULT '',
  apply_link       TEXT DEFAULT '',
  openings         INTEGER DEFAULT 1,
  is_active        BOOLEAN DEFAULT TRUE,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE applied_internships (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        UUID REFERENCES users(id) ON DELETE CASCADE,
  internship_id  TEXT REFERENCES internships(id) ON DELETE CASCADE,
  company        TEXT NOT NULL,
  title          TEXT NOT NULL,
  logo           TEXT DEFAULT '🏢',
  location       TEXT DEFAULT '',
  stipend        TEXT DEFAULT '',
  status         TEXT DEFAULT 'Applied',
  match_score    INTEGER DEFAULT 0,
  applied_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, internship_id)
);

CREATE INDEX idx_users_email        ON users(email);
CREATE INDEX idx_internships_domain ON internships(domain);
CREATE INDEX idx_internships_active ON internships(is_active);
CREATE INDEX idx_applied_user_id    ON applied_internships(user_id);
