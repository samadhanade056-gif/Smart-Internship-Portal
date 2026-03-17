from flask import Flask, request, jsonify
import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from skill_extractor import analyze_resume
from matcher import full_pipeline

app = Flask(__name__)

@app.route('/api/analyze', methods=['POST'])
def analyze():
    # Attempt to read 'resumeText' instead of the file directly
    data = request.get_json()
    if not data or 'text' not in data:
        return jsonify({'error': 'No text provided'}), 400
    
    resume_text = data['text']
    try:
        results = analyze_resume(resume_text, is_pdf=False)
        return jsonify(results)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok'})

if __name__ == '__main__':
    app.run(port=8000, debug=True)
