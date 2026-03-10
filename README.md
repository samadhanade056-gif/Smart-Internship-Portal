# 🚀 InternAI — Smart Internship Portal with AI Skill Matching

> AI-powered internship recommendation platform that extracts skills from resumes and matches students to the best opportunities.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/yourusername/smart-internship-portal)

---

## ✨ Live Demo

- **Frontend**: `https://your-project.vercel.app`
- **Demo Login**: `demo@internai.com` / `demo1234`

---

## 📸 Features

| Feature | Description |
|---|---|
| 🧠 AI Resume Parser | Upload PDF/DOCX — NLP extracts 200+ skills |
| 🎯 Smart Matching | Cosine similarity ranks internships by fit % |
| 📉 Skill Gap Analysis | Shows exactly what you're missing |
| 📊 ATS Score | Resume quality score out of 100 |
| 🔍 Browse & Filter | Search all internships by domain, location, stipend |
| 🔐 Auth | JWT-based register/login |

---

## 🛠️ Tech Stack

**Frontend**: HTML5 · CSS3 · Vanilla JavaScript  
**Backend**: Node.js · Express.js  
**AI / NLP**: Python · spaCy · scikit-learn · RapidFuzz · Sentence-BERT  
**Database**: JSON (internships) · In-memory (users) · MongoDB-ready  
**Deployment**: Vercel  

---

## 📁 Project Structure

```
smart-internship-portal/
├── frontend/
│   ├── index.html          ← Landing page
│   ├── css/style.css       ← All styles
│   ├── js/main.js          ← All JS
│   └── pages/
│       ├── login.html
│       ├── register.html
│       ├── dashboard.html  ← Upload + results
│       └── internships.html ← Browse all
│
├── backend/
│   ├── server.js           ← Express server
│   ├── middleware/auth.js  ← JWT middleware
│   └── routes/
│       ├── auth.js         ← Register/Login
│       ├── resume.js       ← Upload + AI analyze
│       ├── internships.js  ← Browse/filter
│       └── dashboard.js    ← User stats
│
├── ai_model/
│   ├── skill_extractor.py  ← Advanced NLP pipeline
│   └── matcher.py          ← Recommendation engine
│
├── database/
│   └── internships.json    ← 10+ internship records
│
├── vercel.json             ← Vercel deployment config
├── package.json
└── .env.example
```

---

## ⚙️ Local Setup

### 1. Clone the repo
```bash
git clone https://github.com/yourusername/smart-internship-portal.git
cd smart-internship-portal
```

### 2. Install Node.js dependencies
```bash
npm install
```

### 3. Set up environment variables
```bash
cp .env.example .env
# Edit .env with your values
```

### 4. (Optional) Set up Python AI service
```bash
pip install -r ai_model/requirements.txt
python -m spacy download en_core_web_lg
python ai_model/skill_extractor.py  # Test it
```

### 5. Start the server
```bash
npm run dev      # development (nodemon)
# or
npm start        # production
```

### 6. Open in browser
```
http://localhost:5000
```

---

## 🚀 Deploy to Vercel

### Option A — One-click (recommended)
Click the **Deploy with Vercel** button at the top.

### Option B — Vercel CLI
```bash
npm install -g vercel
vercel login
vercel --prod
```

### Option C — GitHub Integration
1. Push this repo to GitHub
2. Go to [vercel.com](https://vercel.com) → New Project
3. Import your GitHub repo
4. Add environment variables in Vercel Dashboard:
   - `JWT_SECRET` = your secret key
   - `NODE_ENV` = `production`
5. Click Deploy ✅

---

## 🔑 Environment Variables (Vercel)

| Variable | Value |
|---|---|
| `JWT_SECRET` | any long random string |
| `NODE_ENV` | `production` |
| `FRONTEND_URL` | your Vercel domain |

---

## 🧪 Demo Mode

The app works in **demo mode** without a backend:
- Click "Try Demo Account" on the login page
- Upload any PDF — the UI will simulate AI analysis
- All features work with mock data

---

## 📜 License

MIT — Free for educational and hackathon use.

---

**Built with ❤️ for Hackathon 2025**
