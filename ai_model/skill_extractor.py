"""
╔══════════════════════════════════════════════════════════════════════╗
║      Smart Internship Portal — Advanced NLP Skill Extractor         ║
║      File   : ai_model/skill_extractor.py                           ║
║                                                                      ║
║  Pipeline:                                                           ║
║   1. PDF/DOCX/TXT  → Raw Text  (pdfplumber + python-docx)           ║
║   2. Section Detection         (regex header heuristics)            ║
║   3. Text Preprocessing        (tokenize, lemmatize, POS via spaCy) ║
║   4. Skill Extraction          (keyword + n-gram + fuzzy + TF-IDF)  ║
║   5. Confidence Scoring        (ensemble fusion per skill)          ║
║   6. NER                       (spaCy: org, location, date)         ║
║   7. Contact + Education + Experience Inference                     ║
║   8. Semantic Skill Tagging    (Sentence-BERT cosine similarity)    ║
║   9. ATS Resume Score          (completeness scoring 0–100)         ║
╚══════════════════════════════════════════════════════════════════════╝

Install:
  pip install pdfplumber python-docx spacy scikit-learn rapidfuzz
              sentence-transformers torch
  python -m spacy download en_core_web_lg
"""

# ── Standard Library ────────────────────────────────────────────────
import re
import json
import math
import logging
import warnings
import datetime
from pathlib import Path
from collections import Counter, defaultdict
from typing import Optional

warnings.filterwarnings("ignore")
logging.basicConfig(level=logging.INFO, format="[%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

# ── Third-party ──────────────────────────────────────────────────────
import pdfplumber

try:
    import docx
    DOCX_AVAILABLE = True
except ImportError:
    DOCX_AVAILABLE = False

import spacy
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity as sklearn_cosine
from rapidfuzz import fuzz, process as fuzz_process

try:
    from sentence_transformers import SentenceTransformer, util as st_util
    SBERT_AVAILABLE = True
except ImportError:
    SBERT_AVAILABLE = False
    log.warning("sentence-transformers not installed. Semantic matching disabled.")


# ════════════════════════════════════════════════════════════════════
#  spaCy Model  (large gives better NER + vectors)
# ════════════════════════════════════════════════════════════════════
def _load_spacy(model: str = "en_core_web_lg") -> spacy.language.Language:
    try:
        return spacy.load(model)
    except OSError:
        log.warning(f"{model} not found → falling back to en_core_web_sm")
        try:
            return spacy.load("en_core_web_sm")
        except OSError:
            import subprocess
            subprocess.run(["python", "-m", "spacy", "download", "en_core_web_sm"], check=True)
            return spacy.load("en_core_web_sm")

nlp = _load_spacy()

# ════════════════════════════════════════════════════════════════════
#  Sentence-BERT (lazy-loaded on first semantic call)
# ════════════════════════════════════════════════════════════════════
_sbert_model = None

def get_sbert() -> Optional["SentenceTransformer"]:
    global _sbert_model
    if not SBERT_AVAILABLE:
        return None
    if _sbert_model is None:
        log.info("Loading Sentence-BERT (all-MiniLM-L6-v2)…")
        _sbert_model = SentenceTransformer("all-MiniLM-L6-v2")
    return _sbert_model


# ════════════════════════════════════════════════════════════════════
#  Master Skills Taxonomy  (200+ skills, 10 domains)
# ════════════════════════════════════════════════════════════════════
SKILLS_DB: dict = {
    "programming_languages": [
        "python", "java", "javascript", "typescript", "c", "c++", "c#",
        "ruby", "go", "golang", "rust", "kotlin", "swift", "php", "scala",
        "r", "matlab", "perl", "dart", "bash", "shell", "powershell",
        "groovy", "lua", "haskell", "elixir", "clojure", "vba", "objective-c"
    ],
    "web_frontend": [
        "html", "html5", "css", "css3", "react", "reactjs", "react.js",
        "angular", "angularjs", "vue", "vuejs", "vue.js", "next.js", "nextjs",
        "nuxt", "nuxtjs", "svelte", "bootstrap", "tailwind", "tailwindcss",
        "sass", "scss", "less", "jquery", "redux", "zustand", "webpack",
        "vite", "parcel", "babel", "storybook", "cypress", "jest",
        "material ui", "ant design", "chakra ui", "framer motion"
    ],
    "web_backend": [
        "node.js", "nodejs", "express", "expressjs", "django", "flask",
        "fastapi", "spring", "spring boot", "laravel", "rails", "ruby on rails",
        "asp.net", ".net core", "graphql", "rest api", "restful api",
        "grpc", "microservices", "websockets", "oauth", "jwt",
        "celery", "rabbitmq", "kafka", "redis queue", "fastify", "hapi"
    ],
    "databases": [
        "sql", "mysql", "postgresql", "postgres", "mongodb", "sqlite",
        "redis", "firebase", "firestore", "cassandra", "dynamodb", "oracle",
        "mssql", "sql server", "elasticsearch", "neo4j", "supabase",
        "cockroachdb", "influxdb", "hbase", "mariadb", "bigquery",
        "snowflake", "databricks", "dbt", "prisma", "sequelize", "mongoose"
    ],
    "ai_ml": [
        "machine learning", "deep learning", "nlp", "natural language processing",
        "computer vision", "tensorflow", "pytorch", "keras", "scikit-learn",
        "sklearn", "pandas", "numpy", "matplotlib", "seaborn", "plotly",
        "opencv", "huggingface", "transformers", "bert", "gpt", "llm",
        "langchain", "llamaindex", "xgboost", "lightgbm", "catboost",
        "spacy", "nltk", "gensim", "fasttext", "word2vec", "glove",
        "reinforcement learning", "generative ai", "diffusion models",
        "stable diffusion", "rag", "vector database", "pinecone", "weaviate",
        "feature engineering", "model deployment", "mlflow", "wandb",
        "statistical analysis", "a/b testing", "time series",
        "anomaly detection", "recommendation system"
    ],
    "cloud_devops": [
        "aws", "amazon web services", "azure", "microsoft azure", "gcp",
        "google cloud", "google cloud platform", "docker", "kubernetes", "k8s",
        "terraform", "ansible", "jenkins", "ci/cd", "github actions",
        "gitlab ci", "circleci", "travis ci", "linux", "ubuntu", "nginx",
        "apache", "heroku", "vercel", "netlify", "cloudflare",
        "aws ec2", "aws s3", "aws lambda", "aws rds", "aws eks",
        "azure devops", "load balancing", "auto scaling",
        "prometheus", "grafana", "elk stack", "datadog", "new relic"
    ],
    "data_engineering": [
        "apache spark", "spark", "hadoop", "hive", "pig", "airflow",
        "apache kafka", "flink", "beam", "etl", "data pipeline",
        "data warehouse", "data lake", "data lakehouse", "delta lake",
        "pandas", "polars", "dask", "pyspark", "nifi",
        "talend", "informatica", "fivetran", "airbyte", "stitch"
    ],
    "tools_platforms": [
        "git", "github", "gitlab", "bitbucket", "jira", "confluence",
        "postman", "insomnia", "swagger", "figma", "adobe xd", "sketch",
        "unity", "unreal engine", "blender", "android", "ios",
        "flutter", "react native", "expo", "xcode", "android studio",
        "vs code", "intellij", "pycharm", "vim", "jupyter", "google colab",
        "notion", "slack", "trello", "asana"
    ],
    "cybersecurity": [
        "cybersecurity", "penetration testing", "ethical hacking",
        "network security", "cryptography", "owasp", "siem", "soc",
        "vulnerability assessment", "burp suite", "metasploit", "nmap",
        "wireshark", "kali linux", "firewall", "ssl/tls", "zero trust",
        "devsecops", "iam", "sso", "ldap"
    ],
    "soft_skills": [
        "communication", "teamwork", "leadership", "problem solving",
        "critical thinking", "time management", "agile", "scrum", "kanban",
        "project management", "presentation", "analytical thinking",
        "collaboration", "adaptability", "creativity", "mentoring",
        "cross-functional", "stakeholder management"
    ]
}

# Flat set for fast lookup
ALL_SKILLS_FLAT: set = {s for skills in SKILLS_DB.values() for s in skills}

# Reverse lookup: skill → category
SKILL_TO_CATEGORY: dict = {
    skill: cat
    for cat, skills in SKILLS_DB.items()
    for skill in skills
}


# ════════════════════════════════════════════════════════════════════
#  Resume Section Header Patterns
# ════════════════════════════════════════════════════════════════════
SECTION_PATTERNS: dict = {
    "skills": [
        r"(?i)(technical\s+)?skills?(\s+&\s+tools?)?",
        r"(?i)core\s+competenc(y|ies)",
        r"(?i)technologies",
        r"(?i)expertise",
        r"(?i)tools?\s+&\s+technologies?"
    ],
    "experience": [
        r"(?i)(work\s+|professional\s+)?experience",
        r"(?i)employment(\s+history)?",
        r"(?i)internship(s)?",
        r"(?i)work\s+history"
    ],
    "education": [
        r"(?i)education(al)?(\s+background)?",
        r"(?i)academic(s)?(\s+background)?",
        r"(?i)qualifications?"
    ],
    "projects": [
        r"(?i)projects?(\s+&\s+publications?)?",
        r"(?i)personal\s+projects?",
        r"(?i)academic\s+projects?",
        r"(?i)key\s+projects?"
    ],
    "certifications": [
        r"(?i)certifications?",
        r"(?i)licen[sc]es?(\s+&\s+certifications?)?",
        r"(?i)courses?(\s+&\s+certifications?)?"
    ],
    "summary": [
        r"(?i)(professional\s+)?summary",
        r"(?i)objective",
        r"(?i)profile",
        r"(?i)about(\s+me)?"
    ]
}


# ════════════════════════════════════════════════════════════════════
#  1. FILE READERS
# ════════════════════════════════════════════════════════════════════

def read_pdf(path: str) -> str:
    """Extract text from PDF using pdfplumber with layout-aware settings."""
    parts = []
    try:
        with pdfplumber.open(path) as pdf:
            for page in pdf.pages:
                t = page.extract_text(x_tolerance=2, y_tolerance=3)
                if t:
                    parts.append(t)
    except Exception as e:
        log.error(f"PDF read error: {e}")
    return "\n".join(parts)


def read_docx(path: str) -> str:
    """Extract text from DOCX file."""
    if not DOCX_AVAILABLE:
        log.error("python-docx not installed. Run: pip install python-docx")
        return ""
    try:
        doc = docx.Document(path)
        return "\n".join(p.text for p in doc.paragraphs if p.text.strip())
    except Exception as e:
        log.error(f"DOCX read error: {e}")
        return ""


def read_file(path: str) -> str:
    """Auto-detect file type and extract text."""
    p = Path(path)
    ext = p.suffix.lower()
    if ext == ".pdf":
        return read_pdf(path)
    elif ext in (".docx", ".doc"):
        return read_docx(path)
    else:
        return p.read_text(encoding="utf-8", errors="ignore")


# ════════════════════════════════════════════════════════════════════
#  2. TEXT PREPROCESSING
# ════════════════════════════════════════════════════════════════════

def clean_text(text: str) -> str:
    """Remove non-printable chars, normalize whitespace."""
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]", " ", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def normalize_for_matching(text: str) -> str:
    """Lowercase, keep only alphanumeric + key punctuation."""
    text = text.lower()
    text = re.sub(r"[^a-z0-9\s\.\+\#\/\-]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def lemmatize_text(text: str) -> str:
    """
    spaCy lemmatization — reduces inflected forms to base form.
    e.g. 'developing' → 'develop', 'databases' → 'database'
    """
    doc = nlp(text[:200_000])
    tokens = []
    for token in doc:
        if token.is_space or token.is_punct:
            continue
        if token.pos_ in ("PROPN", "NOUN", "VERB"):
            tokens.append(token.lemma_.lower())
        else:
            tokens.append(token.text.lower())
    return " ".join(tokens)


# ════════════════════════════════════════════════════════════════════
#  3. SECTION DETECTION
# ════════════════════════════════════════════════════════════════════

def detect_sections(text: str) -> dict:
    """
    Splits resume into labeled sections by detecting common headers.
    Returns: {"skills": "...", "experience": "...", "education": "...", ...}
    """
    lines = text.split("\n")
    sections = defaultdict(list)
    current = "header"

    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        detected = None
        for sec_name, patterns in SECTION_PATTERNS.items():
            for pat in patterns:
                if re.fullmatch(pat + r"[\s:]*", stripped, re.IGNORECASE):
                    detected = sec_name
                    break
            if detected:
                break

        if detected:
            current = detected
        else:
            sections[current].append(stripped)

    return {k: "\n".join(v) for k, v in sections.items()}


# ════════════════════════════════════════════════════════════════════
#  4a. KEYWORD + REGEX EXTRACTION
# ════════════════════════════════════════════════════════════════════

def extract_by_keyword(text: str) -> dict:
    """
    Exact n-gram matching with word-boundary regex.
    Returns skills grouped by category.
    """
    normalized = normalize_for_matching(text)
    matched = {}
    for category, skills in SKILLS_DB.items():
        found = []
        for skill in skills:
            pattern = r"(?<![a-z0-9])" + re.escape(skill) + r"(?![a-z0-9])"
            if re.search(pattern, normalized):
                found.append(skill)
        if found:
            matched[category] = found
    return matched


# ════════════════════════════════════════════════════════════════════
#  4b. spaCy POS-BASED NOUN PHRASE EXTRACTION
# ════════════════════════════════════════════════════════════════════

def extract_by_pos(text: str) -> list:
    """
    Extracts multi-word technical noun phrases using spaCy POS tags.
    Good at catching unlisted skills written as compound terms.
    """
    NON_SKILL_WORDS = {
        "i", "we", "the", "a", "an", "is", "are", "was", "were",
        "have", "has", "had", "will", "would", "could", "should",
        "university", "college", "bachelor", "master", "degree",
        "gpa", "cgpa", "year", "month", "present", "current"
    }
    doc = nlp(text[:200_000])
    candidates = set()
    for chunk in doc.noun_chunks:
        phrase = chunk.text.strip().lower()
        words = phrase.split()
        if (
            1 <= len(words) <= 4
            and all(w not in NON_SKILL_WORDS for w in words)
            and not chunk.root.is_stop
        ):
            candidates.add(phrase)
    return list(candidates)


# ════════════════════════════════════════════════════════════════════
#  4c. FUZZY MATCHING  (catches typos like "Pythonn", "Recat")
# ════════════════════════════════════════════════════════════════════

def extract_by_fuzzy(text: str, threshold: int = 88, max_candidates: int = 300) -> dict:
    """
    Generates n-grams from resume and fuzzy-matches against skill list.
    Returns {skill: confidence_0_to_1} for matches above threshold.
    """
    normalized = normalize_for_matching(text)
    tokens = normalized.split()
    skill_list = sorted(ALL_SKILLS_FLAT)

    # 1–3 gram candidates
    ngrams = []
    for n in range(1, 4):
        for i in range(len(tokens) - n + 1):
            ngrams.append(" ".join(tokens[i:i+n]))

    ngrams = list(set(ngrams))[:max_candidates]

    results = {}
    for gram in ngrams:
        match = fuzz_process.extractOne(
            gram, skill_list,
            scorer=fuzz.token_sort_ratio,
            score_cutoff=threshold
        )
        if match:
            skill_name, score, _ = match
            if skill_name not in results or results[skill_name] < score:
                results[skill_name] = round(score / 100, 3)

    return results


# ════════════════════════════════════════════════════════════════════
#  4d. TF-IDF SECTION-WEIGHTED SCORING
# ════════════════════════════════════════════════════════════════════

def tfidf_skill_score(text: str, sections: dict) -> dict:
    """
    Scores each skill based on how frequently it appears across
    sections, weighted by section importance.

    Section weights:
      skills section     → 3.0x  (explicit skills list = high signal)
      certifications     → 1.8x
      projects           → 2.0x
      experience         → 1.5x
      summary            → 1.2x
      education          → 1.0x
      header / other     → 0.8x
    """
    SECTION_WEIGHTS = {
        "skills": 3.0, "projects": 2.0, "certifications": 1.8,
        "experience": 1.5, "summary": 1.2, "education": 1.0, "header": 0.8
    }

    skill_scores = {}

    for sec_name, sec_text in sections.items():
        if not sec_text.strip():
            continue
        weight = SECTION_WEIGHTS.get(sec_name, 1.0)
        norm = normalize_for_matching(sec_text)

        for skill in ALL_SKILLS_FLAT:
            pattern = r"(?<![a-z0-9])" + re.escape(skill) + r"(?![a-z0-9])"
            count = len(re.findall(pattern, norm))
            if count > 0:
                tf = 1 + math.log(count)  # Log-scaled TF
                skill_scores[skill] = skill_scores.get(skill, 0) + tf * weight

    # Normalize to 0–1
    if skill_scores:
        max_score = max(skill_scores.values())
        skill_scores = {k: round(v / max_score, 3) for k, v in skill_scores.items()}

    return skill_scores


# ════════════════════════════════════════════════════════════════════
#  4e. SEMANTIC MATCHING  (Sentence-BERT)
# ════════════════════════════════════════════════════════════════════

def extract_by_semantic(sentences: list, threshold: float = 0.55) -> dict:
    """
    Encodes resume sentences with Sentence-BERT and computes cosine
    similarity against skill name embeddings.

    Returns {skill: max_similarity_score} for skills above threshold.
    Only runs if sentence-transformers is installed.
    """
    model = get_sbert()
    if not model or not sentences:
        return {}

    skill_list = sorted(ALL_SKILLS_FLAT)

    try:
        skill_emb = model.encode(skill_list, convert_to_tensor=True, show_progress_bar=False)
        sent_emb  = model.encode(sentences,  convert_to_tensor=True, show_progress_bar=False)
        sim_matrix = st_util.cos_sim(sent_emb, skill_emb)

        semantic_scores = {}
        for row in sim_matrix:
            for idx, score in enumerate(row):
                s = float(score)
                if s >= threshold:
                    skill = skill_list[idx]
                    if skill not in semantic_scores or semantic_scores[skill] < s:
                        semantic_scores[skill] = round(s, 3)

        return semantic_scores

    except Exception as e:
        log.warning(f"Semantic extraction error: {e}")
        return {}


# ════════════════════════════════════════════════════════════════════
#  5. CONFIDENCE FUSION  (ensemble of all signals)
# ════════════════════════════════════════════════════════════════════

def compute_confidence(
    keyword_hits: set,
    fuzzy_scores: dict,
    tfidf_scores: dict,
    semantic_scores: dict
) -> dict:
    """
    Fuses all 4 extraction signals into a single confidence score per skill.

    Signal weights:
      Keyword exact match   → 40%  (highest trust: direct match)
      TF-IDF section score  → 30%  (context + frequency aware)
      Fuzzy match score     → 15%  (catches variants/typos)
      Semantic similarity   → 15%  (conceptual relevance)

    A skill must have confidence >= min_confidence to be included.
    """
    W_KW, W_TFIDF, W_FUZZY, W_SEM = 0.40, 0.30, 0.15, 0.15

    all_candidates = (
        keyword_hits
        | set(fuzzy_scores.keys())
        | set(tfidf_scores.keys())
        | set(semantic_scores.keys())
    )

    scored = {}
    for skill in all_candidates:
        kw  = 1.0 if skill in keyword_hits else 0.0
        tf  = tfidf_scores.get(skill, 0.0)
        fz  = fuzzy_scores.get(skill, 0.0)
        sem = semantic_scores.get(skill, 0.0)

        confidence = round(kw * W_KW + tf * W_TFIDF + fz * W_FUZZY + sem * W_SEM, 3)

        # Require at least keyword OR two strong secondary signals
        secondary_ok = sum([tf > 0.1, fz > 0.75, sem > 0.55]) >= 2
        if confidence < 0.05 and not secondary_ok:
            continue

        scored[skill] = {
            "confidence": confidence,
            "signals": {
                "keyword_exact": bool(kw),
                "tfidf_score": tf,
                "fuzzy_score": fz,
                "semantic_score": sem
            },
            "category": SKILL_TO_CATEGORY.get(skill, "other")
        }

    return dict(sorted(scored.items(), key=lambda x: -x[1]["confidence"]))


# ════════════════════════════════════════════════════════════════════
#  6. NAMED ENTITY RECOGNITION
# ════════════════════════════════════════════════════════════════════

def extract_entities(text: str) -> dict:
    """
    spaCy NER pass: extracts person names, organizations,
    locations, and date ranges from resume text.
    """
    doc = nlp(text[:200_000])
    entities = {"persons": [], "organizations": [], "locations": [], "dates": []}

    for ent in doc.ents:
        val = ent.text.strip()
        if not val or len(val) < 2:
            continue
        if ent.label_ == "PERSON":
            entities["persons"].append(val)
        elif ent.label_ == "ORG":
            entities["organizations"].append(val)
        elif ent.label_ in ("GPE", "LOC"):
            entities["locations"].append(val)
        elif ent.label_ == "DATE":
            entities["dates"].append(val)

    return {k: sorted(set(v)) for k, v in entities.items()}


# ════════════════════════════════════════════════════════════════════
#  7a. CONTACT EXTRACTION
# ════════════════════════════════════════════════════════════════════

def extract_contact(text: str) -> dict:
    """Extracts email, phone, LinkedIn, GitHub, and portfolio URLs."""
    email     = re.findall(r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+", text)
    phone     = re.findall(r"(\+?\d[\d\s\-\(\)]{7,14}\d)", text)
    linkedin  = re.findall(r"linkedin\.com/in/[\w\-]+", text, re.IGNORECASE)
    github    = re.findall(r"github\.com/[\w\-]+", text, re.IGNORECASE)
    portfolio = re.findall(
        r"https?://(?!linkedin|github)[\w\.\-]+\.[a-z]{2,}/[\w\-\./?=#&%]*",
        text, re.IGNORECASE
    )
    return {
        "email":     email[0]          if email     else None,
        "phone":     phone[0].strip()  if phone     else None,
        "linkedin":  linkedin[0]       if linkedin  else None,
        "github":    github[0]         if github    else None,
        "portfolio": portfolio[0]      if portfolio else None
    }


# ════════════════════════════════════════════════════════════════════
#  7b. EDUCATION INFERENCE
# ════════════════════════════════════════════════════════════════════

def infer_education(text: str) -> dict:
    """
    Infers degree level, field of study, and GPA/CGPA from text.
    Uses simple keyword matching on lowercased text.
    """
    tl = text.lower()

    degree = "Unknown"
    if any(k in tl for k in ["ph.d", "phd", "doctor"]):
        degree = "PhD"
    elif any(k in tl for k in ["m.tech", "m.e.", "m.s.", "msc", "master"]):
        degree = "Masters"
    elif any(k in tl for k in ["b.tech", "b.e.", "b.s.", "bsc", "bachelor", "b.com", "bca"]):
        degree = "Bachelors"
    elif any(k in tl for k in ["diploma", "polytechnic"]):
        degree = "Diploma"
    elif any(k in tl for k in ["12th", "hsc", "higher secondary"]):
        degree = "12th / HSC"

    fields = {
        "computer science":      ["computer science", "cse", " cs "],
        "information technology":["information technology", " it "],
        "data science":          ["data science"],
        "electronics":           ["electronics", "ece", "eee"],
        "mechanical":            ["mechanical", "mech"],
        "civil":                 ["civil engineering"],
        "business / mba":        ["business", "mba", "commerce"],
        "mathematics":           ["mathematics", "statistics"]
    }
    field = "Unknown"
    for f_name, keywords in fields.items():
        if any(k in tl for k in keywords):
            field = f_name
            break

    gpa_match = re.search(
        r"(?:cgpa|gpa|score)[:\s]*([0-9]\.[0-9]{1,2})\s*(?:/\s*(?:10|4))?",
        tl
    )
    gpa = float(gpa_match.group(1)) if gpa_match else None

    return {"degree_level": degree, "field_of_study": field, "gpa": gpa}


# ════════════════════════════════════════════════════════════════════
#  7c. EXPERIENCE INFERENCE
# ════════════════════════════════════════════════════════════════════

def infer_experience(text: str) -> dict:
    """
    Parses date ranges (e.g. 'Jan 2022 – Mar 2024', '2021 - Present')
    to estimate total years of experience and seniority level.
    """
    MONTHS = (
        r"(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|"
        r"jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t)?(?:ember)?|"
        r"oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"
    )
    DATE_PAT = (
        rf"(?:{MONTHS}\s+)?(\d{{4}})"
        rf"\s*[–\-–—to]+\s*"
        rf"(?:{MONTHS}\s+)?(\d{{4}}|present|current|now)"
    )

    matches = re.findall(DATE_PAT, text.lower())
    current_year = datetime.datetime.now().year
    total_months = 0

    for start_yr, end_yr in matches:
        try:
            start = int(start_yr)
            end   = current_year if end_yr in ("present", "current", "now") else int(end_yr)
            if 1990 <= start <= current_year and start <= end:
                total_months += (end - start) * 12
        except ValueError:
            pass

    yrs = round(total_months / 12, 1)
    level = (
        "Fresher (0–1 yr)"    if yrs < 1 else
        "Junior (1–3 yrs)"    if yrs < 3 else
        "Mid-level (3–6 yrs)" if yrs < 6 else
        "Senior (6+ yrs)"
    )

    return {
        "estimated_years": yrs,
        "experience_level": level,
        "roles_detected": len(matches)
    }


# ════════════════════════════════════════════════════════════════════
#  8. ATS RESUME SCORE  (0–100)
# ════════════════════════════════════════════════════════════════════

def compute_ats_score(skills_found: int, contact: dict,
                      education: dict, experience: dict, sections: dict) -> dict:
    """
    ATS-style resume completeness score.

    Breakdown:
      Skills richness     → max 35 pts
      Contact info        → max 15 pts
      Education           → max 15 pts
      Section coverage    → max 20 pts
      Experience entries  → max 15 pts
    """
    score = 0
    breakdown = {}

    skill_pts = min(skills_found * 1.5, 35)
    score += skill_pts
    breakdown["skills_richness"] = round(skill_pts, 1)

    contact_pts = (
        bool(contact.get("email"))    * 5 +
        bool(contact.get("phone"))    * 4 +
        bool(contact.get("linkedin")) * 3 +
        bool(contact.get("github"))   * 3
    )
    score += contact_pts
    breakdown["contact_completeness"] = contact_pts

    edu_pts = (
        (education["degree_level"] != "Unknown") * 8 +
        (education["field_of_study"] != "Unknown") * 4 +
        bool(education["gpa"]) * 3
    )
    score += edu_pts
    breakdown["education"] = edu_pts

    key_sections = ["skills", "experience", "education", "projects", "certifications"]
    sec_pts = sum(4 for s in key_sections if sections.get(s, "").strip())
    score += sec_pts
    breakdown["sections_present"] = sec_pts

    exp_pts = min(experience["roles_detected"] * 5, 15)
    score += exp_pts
    breakdown["experience_entries"] = exp_pts

    total = round(min(score, 100), 1)
    grade = ("A+" if total >= 90 else "A" if total >= 80 else
             "B"  if total >= 70 else "C" if total >= 55 else "D")

    return {"total_score": total, "grade": grade, "breakdown": breakdown}


# ════════════════════════════════════════════════════════════════════
#  9. MASTER PIPELINE
# ════════════════════════════════════════════════════════════════════

def analyze_resume(
    source: str,
    is_pdf: bool = True,
    use_semantic: bool = True,
    min_confidence: float = 0.10
) -> dict:
    """
    Full Advanced NLP Resume Analysis Pipeline.

    Args:
        source:         File path (PDF/DOCX/TXT) OR raw text string
        is_pdf:         True → read from file; False → use raw text directly
        use_semantic:   Enable Sentence-BERT semantic skill matching
        min_confidence: Minimum confidence threshold to include a skill (0–1)

    Returns:
        Comprehensive structured dict with all extracted resume information.
    """
    log.info("━" * 60)
    log.info("  Advanced NLP Resume Analyzer — Starting Pipeline")
    log.info("━" * 60)

    # ── Step 1: Load & Clean Text ─────────────────────────────────────
    log.info("[1/9] Loading & cleaning resume text…")
    raw_text = read_file(source) if is_pdf else source
    if not raw_text.strip():
        return {"error": "No text could be extracted from the resume."}
    cleaned = clean_text(raw_text)
    log.info(f"      Text length: {len(cleaned):,} chars")

    # ── Step 2: Detect Sections ───────────────────────────────────────
    log.info("[2/9] Detecting resume sections…")
    sections = detect_sections(cleaned)
    log.info(f"      Found: {list(sections.keys())}")

    # ── Step 3: Lemmatize ─────────────────────────────────────────────
    log.info("[3/9] Lemmatizing text (spaCy)…")
    lemmatized = lemmatize_text(cleaned)

    # ── Step 4a: Keyword Matching ─────────────────────────────────────
    log.info("[4/9] Keyword-based skill extraction…")
    kw_by_cat   = extract_by_keyword(cleaned)
    keyword_hits = {s for skills in kw_by_cat.values() for s in skills}
    log.info(f"      Keyword hits: {len(keyword_hits)}")

    # ── Step 4b: TF-IDF Scoring ───────────────────────────────────────
    log.info("[5/9] TF-IDF section-weighted scoring…")
    tfidf_scores = tfidf_skill_score(cleaned, sections)

    # ── Step 4c: Fuzzy Matching ───────────────────────────────────────
    log.info("[6/9] Fuzzy skill matching (RapidFuzz)…")
    fuzzy_scores = extract_by_fuzzy(cleaned)
    log.info(f"      Fuzzy candidates: {len(fuzzy_scores)}")

    # ── Step 4d: Semantic Matching ────────────────────────────────────
    semantic_scores = {}
    if use_semantic and SBERT_AVAILABLE:
        log.info("[7/9] Semantic matching (Sentence-BERT)…")
        sentences = [
            s.strip() for s in re.split(r"[.\n]", cleaned)
            if len(s.strip()) > 15
        ][:120]
        semantic_scores = extract_by_semantic(sentences)
        log.info(f"      Semantic hits: {len(semantic_scores)}")
    else:
        log.info("[7/9] Semantic matching skipped (library not available).")

    # ── Step 5: Confidence Fusion ─────────────────────────────────────
    log.info("[8/9] Fusing signals into confidence scores…")
    scored_skills = compute_confidence(keyword_hits, fuzzy_scores, tfidf_scores, semantic_scores)
    scored_skills = {k: v for k, v in scored_skills.items() if v["confidence"] >= min_confidence}

    # Group by category
    by_category = defaultdict(list)
    for skill, data in scored_skills.items():
        by_category[data["category"]].append({
            "skill": skill,
            "confidence": data["confidence"],
            "signals": data["signals"]
        })
    for cat in by_category:
        by_category[cat].sort(key=lambda x: -x["confidence"])

    all_skills   = sorted(scored_skills.keys())
    top_skills   = [s for s, d in scored_skills.items() if d["confidence"] >= 0.35]

    # ── Step 6–7: NER + Contact + Education + Experience ──────────────
    log.info("[9/9] NER, contact, education & experience inference…")
    entities   = extract_entities(cleaned)
    contact    = extract_contact(cleaned)
    education  = infer_education(cleaned)
    experience = infer_experience(cleaned)
    ats_score  = compute_ats_score(len(all_skills), contact, education, experience, sections)

    log.info(f"━━━ Done: {len(all_skills)} skills | ATS {ats_score['total_score']}/100 ━━━")

    return {
        "metadata": {
            "source": str(source) if is_pdf else "raw_text_input",
            "text_length_chars": len(cleaned),
            "sections_detected": list(sections.keys()),
            "nlp_engines": {
                "spacy_model": nlp.meta.get("name", "unknown"),
                "fuzzy_matching": True,
                "tfidf_section_weighting": True,
                "semantic_matching_sbert": SBERT_AVAILABLE and use_semantic
            }
        },
        "contact": contact,
        "education": education,
        "experience": experience,
        "entities": entities,
        "skills": {
            "all_skills": all_skills,
            "top_skills": top_skills,
            "total_skills_found": len(all_skills),
            "by_category": dict(by_category),
            "scored_skills_detail": scored_skills
        },
        "ats_score": ats_score,
        "sections_preview": {
            k: v[:250] + "…" for k, v in sections.items() if v.strip()
        }
    }


# ════════════════════════════════════════════════════════════════════
#  CLI Entry Point
# ════════════════════════════════════════════════════════════════════
if __name__ == "__main__":
    import sys

    SAMPLE_RESUME = """
    Priya Sharma
    priya.sharma@gmail.com | +91-9876543210
    linkedin.com/in/priyasharma | github.com/priyasharma
    Mumbai, Maharashtra

    PROFESSIONAL SUMMARY
    Final year B.Tech Computer Science student with strong expertise in Python,
    Machine Learning, and Full-Stack Web Development. Passionate about building
    AI-driven products and scalable cloud applications.

    TECHNICAL SKILLS
    Languages    : Python, JavaScript, TypeScript, Java, SQL, Bash
    Frontend     : React.js, Next.js, Tailwind CSS, HTML5, CSS3, Redux
    Backend      : Node.js, Express.js, Flask, FastAPI, REST API, GraphQL
    AI/ML        : Machine Learning, Deep Learning, NLP, TensorFlow, PyTorch,
                   Scikit-learn, Pandas, NumPy, Matplotlib, spaCy, BERT
    Databases    : MongoDB, PostgreSQL, MySQL, Redis, Firebase
    DevOps/Cloud : Docker, AWS (EC2, S3, Lambda), GitHub Actions, Linux, CI/CD
    Tools        : Git, GitHub, Postman, Figma, Jupyter, VS Code, Jira

    EXPERIENCE
    Machine Learning Intern — DataWave Analytics, Mumbai (Jun 2024 – Sep 2024)
    - Built text classification model using BERT (HuggingFace Transformers)
    - Created ETL pipelines with Pandas and NumPy to process 500K+ records
    - Deployed REST API using FastAPI on AWS EC2 with Docker containers
    - Achieved 93% accuracy on sentiment analysis (F1 Score: 0.91)

    Full Stack Developer Intern — WebNova Pvt Ltd (Jan 2024 – Apr 2024)
    - Developed React.js dashboard with Redux state management
    - Built Node.js / Express.js backend with MongoDB database
    - Implemented JWT authentication and role-based access control

    PROJECTS
    1. AI Resume Analyzer   — Python, spaCy, NLTK, Flask, React
    2. E-Commerce Platform  — Next.js, Node.js, PostgreSQL, Redis, Docker
    3. Stock Price Predictor — Python, LSTM, TensorFlow, Pandas

    EDUCATION
    B.Tech Computer Science — XYZ University (2021–2025) | CGPA: 8.7 / 10

    CERTIFICATIONS
    - AWS Certified Cloud Practitioner (2024)
    - Google Data Analytics Professional Certificate (2023)
    - Deep Learning Specialization — Coursera (2023)
    """

    print("\n" + "═" * 68)
    print("    Smart Internship Portal — Advanced NLP Skill Extractor")
    print("═" * 68)

    if len(sys.argv) > 1:
        print(f"\n📄 Analyzing file: {sys.argv[1]}")
        result = analyze_resume(sys.argv[1], is_pdf=True)
    else:
        print("\n📄 Analyzing sample resume…")
        result = analyze_resume(SAMPLE_RESUME, is_pdf=False)

    # ── Pretty Print Results ──────────────────────────────────────────
    print(f"\n{'─'*68}")
    print("  📇 CONTACT INFO")
    print(f"{'─'*68}")
    for k, v in result["contact"].items():
        if v:
            print(f"  {k:<12}: {v}")

    print(f"\n{'─'*68}")
    print("  🎓 EDUCATION & EXPERIENCE")
    print(f"{'─'*68}")
    edu = result["education"]
    exp = result["experience"]
    print(f"  Degree      : {edu['degree_level']} in {edu['field_of_study']}")
    print(f"  GPA/CGPA    : {edu['gpa'] or 'Not mentioned'}")
    print(f"  Experience  : {exp['estimated_years']} yrs — {exp['experience_level']}")
    print(f"  Roles found : {exp['roles_detected']}")

    print(f"\n{'─'*68}")
    total = result['skills']['total_skills_found']
    print(f"  🧠 SKILLS DETECTED: {total}  |  Top: {len(result['skills']['top_skills'])}")
    print(f"{'─'*68}")
    for cat, items in result["skills"]["by_category"].items():
        names = [f"{i['skill']} ({i['confidence']:.0%})" for i in items[:5]]
        print(f"  {cat:<22}: {', '.join(names)}")

    print(f"\n{'─'*68}")
    ats = result["ats_score"]
    print(f"  📊 ATS SCORE: {ats['total_score']}/100  [Grade: {ats['grade']}]")
    print(f"{'─'*68}")
    for k, v in ats["breakdown"].items():
        print(f"  {k:<28}: {v} pts")

    # Save JSON
    out = Path("extracted_skills.json")
    with open(out, "w") as f:
        json.dump(result, f, indent=2)
    print(f"\n✅ Full results saved → {out}\n")
