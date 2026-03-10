"""
===============================================================
  Smart Internship Portal — AI Internship Matcher
  File: ai_model/matcher.py
  Description: Matches student skills with internship requirements,
               calculates match scores, and performs skill gap analysis.
===============================================================
"""

import json
import math
import re
from pathlib import Path
from skill_extractor import analyze_resume, SKILLS_DB


# ─────────────────────────────────────────────
#  Sample Internship Database
#  In production, load from MongoDB/PostgreSQL
# ─────────────────────────────────────────────
INTERNSHIP_DATABASE = [
    {
        "id": "INT001",
        "title": "Python Backend Developer Intern",
        "company": "TechCorp Solutions",
        "location": "Remote",
        "duration": "3 months",
        "stipend": "₹15,000/month",
        "required_skills": ["python", "flask", "sql", "git", "rest api"],
        "preferred_skills": ["docker", "aws", "postgresql"],
        "description": "Work on scalable backend APIs using Python and Flask.",
        "domain": "web_backend"
    },
    {
        "id": "INT002",
        "title": "Full Stack Developer Intern",
        "company": "StartupXYZ",
        "location": "Bangalore",
        "duration": "6 months",
        "stipend": "₹20,000/month",
        "required_skills": ["react", "node.js", "mongodb", "javascript"],
        "preferred_skills": ["typescript", "redux", "docker"],
        "description": "Build and maintain full-stack web applications.",
        "domain": "web_frontend"
    },
    {
        "id": "INT003",
        "title": "Machine Learning Intern",
        "company": "AI Ventures",
        "location": "Remote",
        "duration": "3 months",
        "stipend": "₹18,000/month",
        "required_skills": ["python", "machine learning", "pandas", "numpy", "scikit-learn"],
        "preferred_skills": ["tensorflow", "pytorch", "deep learning", "nlp"],
        "description": "Develop and train ML models for predictive analytics.",
        "domain": "ai_ml"
    },
    {
        "id": "INT004",
        "title": "Data Science Intern",
        "company": "DataWave Analytics",
        "location": "Mumbai",
        "duration": "4 months",
        "stipend": "₹12,000/month",
        "required_skills": ["python", "sql", "pandas", "matplotlib", "numpy"],
        "preferred_skills": ["power bi", "tableau", "machine learning", "seaborn"],
        "description": "Analyze large datasets and build dashboards and reports.",
        "domain": "ai_ml"
    },
    {
        "id": "INT005",
        "title": "DevOps Intern",
        "company": "CloudBase Inc.",
        "location": "Remote",
        "duration": "3 months",
        "stipend": "₹16,000/month",
        "required_skills": ["docker", "linux", "git", "aws"],
        "preferred_skills": ["kubernetes", "terraform", "jenkins", "ci/cd"],
        "description": "Manage CI/CD pipelines and cloud infrastructure.",
        "domain": "cloud_devops"
    },
    {
        "id": "INT006",
        "title": "Frontend Developer Intern",
        "company": "PixelCraft Studio",
        "location": "Delhi",
        "duration": "2 months",
        "stipend": "₹10,000/month",
        "required_skills": ["html", "css", "javascript", "react"],
        "preferred_skills": ["typescript", "tailwind", "figma", "redux"],
        "description": "Design and implement responsive web UIs.",
        "domain": "web_frontend"
    },
    {
        "id": "INT007",
        "title": "NLP / AI Research Intern",
        "company": "ResearchLab AI",
        "location": "Remote",
        "duration": "6 months",
        "stipend": "₹22,000/month",
        "required_skills": ["python", "nlp", "spacy", "transformers", "pytorch"],
        "preferred_skills": ["huggingface", "bert", "gpt", "langchain"],
        "description": "Research and implement NLP models for text classification.",
        "domain": "ai_ml"
    },
    {
        "id": "INT008",
        "title": "Android App Developer Intern",
        "company": "MobileMagic",
        "location": "Pune",
        "duration": "3 months",
        "stipend": "₹14,000/month",
        "required_skills": ["android", "java", "kotlin", "git"],
        "preferred_skills": ["firebase", "rest api", "sqlite"],
        "description": "Develop and ship Android mobile applications.",
        "domain": "tools_other"
    },
    {
        "id": "INT009",
        "title": "Cloud & AWS Intern",
        "company": "NimbusTech",
        "location": "Remote",
        "duration": "3 months",
        "stipend": "₹17,000/month",
        "required_skills": ["aws", "python", "linux", "git"],
        "preferred_skills": ["docker", "terraform", "s3", "ec2", "lambda"],
        "description": "Deploy and manage cloud services on AWS.",
        "domain": "cloud_devops"
    },
    {
        "id": "INT010",
        "title": "React Native Mobile Dev Intern",
        "company": "AppForge",
        "location": "Hyderabad",
        "duration": "4 months",
        "stipend": "₹13,000/month",
        "required_skills": ["react native", "javascript", "git", "rest api"],
        "preferred_skills": ["typescript", "firebase", "redux", "react"],
        "description": "Build cross-platform mobile apps using React Native.",
        "domain": "tools_other"
    }
]


# ─────────────────────────────────────────────
#  Helper: Build TF-IDF style skill vectors
# ─────────────────────────────────────────────
def build_skill_vector(skills: list, all_skills_universe: list) -> list:
    """
    Converts a list of skills into a binary vector over the universe
    of all known skills (1 = has skill, 0 = does not have skill).
    """
    skill_set = set(s.lower() for s in skills)
    return [1 if skill in skill_set else 0 for skill in all_skills_universe]


# ─────────────────────────────────────────────
#  Core: Cosine Similarity
# ─────────────────────────────────────────────
def cosine_similarity(vec_a: list, vec_b: list) -> float:
    """
    Computes cosine similarity between two skill vectors.
    Returns a float between 0.0 and 1.0.
    """
    dot = sum(a * b for a, b in zip(vec_a, vec_b))
    mag_a = math.sqrt(sum(a ** 2 for a in vec_a))
    mag_b = math.sqrt(sum(b ** 2 for b in vec_b))

    if mag_a == 0 or mag_b == 0:
        return 0.0
    return dot / (mag_a * mag_b)


# ─────────────────────────────────────────────
#  Core: Calculate Match Score
# ─────────────────────────────────────────────
def calculate_match_score(
    student_skills: list,
    required_skills: list,
    preferred_skills: list
) -> dict:
    """
    Calculates a weighted match score:
      - Required skills  → 70% weight
      - Preferred skills → 30% weight

    Args:
        student_skills:   List of skills extracted from resume
        required_skills:  Internship's must-have skills
        preferred_skills: Internship's nice-to-have skills

    Returns:
        dict with score breakdown and matched/missing skills
    """
    student_set = set(s.lower() for s in student_skills)
    required_set = set(s.lower() for s in required_skills)
    preferred_set = set(s.lower() for s in preferred_skills)

    # Matched skills
    matched_required = student_set & required_set
    matched_preferred = student_set & preferred_set

    # Missing skills
    missing_required = required_set - student_set
    missing_preferred = preferred_set - student_set

    # Score calculation
    req_score = (len(matched_required) / len(required_set) * 100) if required_set else 0
    pref_score = (len(matched_preferred) / len(preferred_set) * 100) if preferred_set else 0

    # Weighted total
    total_score = round((req_score * 0.70) + (pref_score * 0.30), 2)

    return {
        "total_score": total_score,
        "required_score": round(req_score, 2),
        "preferred_score": round(pref_score, 2),
        "matched_required": sorted(list(matched_required)),
        "matched_preferred": sorted(list(matched_preferred)),
        "missing_required": sorted(list(missing_required)),
        "missing_preferred": sorted(list(missing_preferred))
    }


# ─────────────────────────────────────────────
#  Core: Skill Gap Analysis
# ─────────────────────────────────────────────
def skill_gap_analysis(student_skills: list, internship: dict) -> dict:
    """
    Provides a structured skill gap report comparing student skills
    to a single internship's requirements.
    """
    score_data = calculate_match_score(
        student_skills,
        internship["required_skills"],
        internship.get("preferred_skills", [])
    )

    # Categorize missing skills by domain
    all_missing = score_data["missing_required"] + score_data["missing_preferred"]
    categorized_missing = {}

    for category, skills in SKILLS_DB.items():
        found_missing = [s for s in all_missing if s in skills]
        if found_missing:
            categorized_missing[category] = found_missing

    return {
        "internship_id": internship["id"],
        "internship_title": internship["title"],
        "company": internship["company"],
        "match_score": score_data["total_score"],
        "strengths": score_data["matched_required"],
        "missing_critical_skills": score_data["missing_required"],
        "missing_bonus_skills": score_data["missing_preferred"],
        "gap_by_category": categorized_missing,
        "recommendation": _generate_recommendation(score_data["total_score"])
    }


def _generate_recommendation(score: float) -> str:
    """Returns a human-readable recommendation based on match score."""
    if score >= 80:
        return "🟢 Excellent match! Highly recommended to apply."
    elif score >= 60:
        return "🟡 Good match. Learn 1–2 missing skills before applying."
    elif score >= 40:
        return "🟠 Moderate match. Significant skill gap — consider upskilling first."
    else:
        return "🔴 Low match. Focus on foundational skills before applying."


# ─────────────────────────────────────────────
#  Master Function: Rank All Internships
# ─────────────────────────────────────────────
def recommend_internships(
    student_skills: list,
    top_n: int = 5,
    min_score: float = 20.0
) -> dict:
    """
    Ranks all internships by match score and returns top N recommendations.

    Args:
        student_skills: Skills extracted from student's resume
        top_n:          Number of top internships to return
        min_score:      Minimum match score threshold (filter out poor matches)

    Returns:
        dict with ranked recommendations and gap analysis
    """
    results = []

    for internship in INTERNSHIP_DATABASE:
        score_data = calculate_match_score(
            student_skills,
            internship["required_skills"],
            internship.get("preferred_skills", [])
        )

        if score_data["total_score"] >= min_score:
            results.append({
                "rank": None,  # Will be set after sorting
                "id": internship["id"],
                "title": internship["title"],
                "company": internship["company"],
                "location": internship["location"],
                "duration": internship["duration"],
                "stipend": internship["stipend"],
                "match_score": score_data["total_score"],
                "matched_skills": score_data["matched_required"],
                "missing_skills": score_data["missing_required"],
                "recommendation": _generate_recommendation(score_data["total_score"])
            })

    # Sort by match score descending
    results.sort(key=lambda x: x["match_score"], reverse=True)

    # Assign ranks
    for i, r in enumerate(results):
        r["rank"] = i + 1

    top_results = results[:top_n]

    # Generate gap analysis for top match only
    top_gap = None
    if top_results:
        top_intern_data = next(
            (i for i in INTERNSHIP_DATABASE if i["id"] == top_results[0]["id"]),
            None
        )
        if top_intern_data:
            top_gap = skill_gap_analysis(student_skills, top_intern_data)

    return {
        "student_skills": sorted(student_skills),
        "total_internships_analyzed": len(INTERNSHIP_DATABASE),
        "matches_found": len(results),
        "top_recommendations": top_results,
        "skill_gap_for_top_match": top_gap
    }


# ─────────────────────────────────────────────
#  Load Internship Database from JSON file
# ─────────────────────────────────────────────
def load_internships_from_file(filepath: str) -> list:
    """
    Loads internship data from a JSON file.
    Falls back to built-in INTERNSHIP_DATABASE if file not found.
    """
    try:
        with open(filepath, "r") as f:
            data = json.load(f)
        print(f"✅ Loaded {len(data)} internships from {filepath}")
        return data
    except FileNotFoundError:
        print(f"⚠️  File not found: {filepath}. Using built-in database.")
        return INTERNSHIP_DATABASE


# ─────────────────────────────────────────────
#  Full Pipeline: Resume → Recommendations
# ─────────────────────────────────────────────
def full_pipeline(resume_source: str, is_pdf: bool = True, top_n: int = 5) -> dict:
    """
    End-to-end pipeline:
      1. Extract skills from resume
      2. Match with internship database
      3. Return ranked recommendations + gap analysis

    Args:
        resume_source: PDF file path or raw text string
        is_pdf:        True if source is a PDF file path
        top_n:         Number of recommendations to return
    """
    print("\n🔍 Step 1: Extracting skills from resume...")
    resume_data = analyze_resume(resume_source, is_pdf=is_pdf)

    if "error" in resume_data:
        return {"error": resume_data["error"]}

    student_skills = resume_data.get("all_skills", [])
    print(f"   ✅ Found {len(student_skills)} skills: {student_skills}")

    print("\n🤖 Step 2: Matching with internship database...")
    recommendations = recommend_internships(student_skills, top_n=top_n)

    print(f"   ✅ Top {len(recommendations['top_recommendations'])} matches found.")

    # Combine results
    final_output = {
        "resume_analysis": {
            "contact": resume_data.get("contact"),
            "skills_by_category": resume_data.get("skills_by_category"),
            "total_skills": resume_data.get("total_skills_found")
        },
        "recommendations": recommendations
    }

    return final_output


# ─────────────────────────────────────────────
#  CLI / Test Entry Point
# ─────────────────────────────────────────────
if __name__ == "__main__":
    import sys

    sample_resume = """
    Jane Smith | jane@example.com | +91-9988776655

    TECHNICAL SKILLS
    Python, React, SQL, Git, Machine Learning, Flask, Pandas, NumPy, Scikit-learn, Docker

    PROJECTS
    - Resume Classifier: Python, spaCy, NLTK, scikit-learn
    - Portfolio Website: React, HTML, CSS, JavaScript
    - Data Dashboard: Python, Pandas, Matplotlib, PostgreSQL
    """

    print("=" * 65)
    print("    Smart Internship Portal — AI Matcher & Recommender")
    print("=" * 65)

    if len(sys.argv) > 1:
        result = full_pipeline(sys.argv[1], is_pdf=True, top_n=5)
    else:
        result = full_pipeline(sample_resume, is_pdf=False, top_n=5)

    print("\n📊 RESULTS:")
    print(json.dumps(result, indent=2))

    # Save results
    output_path = Path("recommendations.json")
    with open(output_path, "w") as f:
        json.dump(result, f, indent=2)
    print(f"\n✅ Recommendations saved to: {output_path}")

    # Pretty print top matches
    print("\n" + "=" * 65)
    print("  🏆 TOP INTERNSHIP RECOMMENDATIONS")
    print("=" * 65)
    for rec in result["recommendations"]["top_recommendations"]:
        print(f"\n  #{rec['rank']} {rec['title']} @ {rec['company']}")
        print(f"     📍 {rec['location']} | ⏱ {rec['duration']} | 💰 {rec['stipend']}")
        print(f"     🎯 Match Score: {rec['match_score']}%")
        print(f"     ✅ Matched: {', '.join(rec['matched_skills']) or 'None'}")
        print(f"     ❌ Missing: {', '.join(rec['missing_skills']) or 'None'}")
        print(f"     {rec['recommendation']}")

    print("\n" + "=" * 65)
    if result["recommendations"].get("skill_gap_for_top_match"):
        gap = result["recommendations"]["skill_gap_for_top_match"]
        print("  📉 SKILL GAP ANALYSIS (Top Match)")
        print("=" * 65)
        print(f"  Internship : {gap['internship_title']}")
        print(f"  Your Score : {gap['match_score']}%")
        print(f"  Strengths  : {', '.join(gap['strengths']) or 'None'}")
        print(f"  Missing    : {', '.join(gap['missing_critical_skills']) or 'None'}")
        print(f"  Verdict    : {gap['recommendation']}")
