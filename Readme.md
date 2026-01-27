# Quran Recitation Tracker (Standalone)

A local, browser-based Quran recitation tester that uses **Speech Recognition** (for text accuracy) and **Spectral Analysis** (for pronunciation accuracy).

## 🚀 Quick Start

### 1. Clone the Repository
```bash
git clone https://github.com/yourusername/quran-recitation-tracker.git
cd quran-recitation-tracker
```

### 2. Install Audio Data
The audio files are too large for Git (~720MB). You must download them separately:
```bash
# Requires Python 3
# This will download all Ayah audio files into data/audio/
python3 download_audio.py
```

### 3. Generate Phonetic Fingerprints (Optional but Recommended)
To make the app load instantly without "training" every time, run this script to pre-calculate the AI sound signatures:
```bash
pip install librosa numpy
python3 generate_phonetics.py
```

### 4. Run the App
This is a web app, so you need a local server to run it properly. Double-clicking `index.html` will NOT work due to browser security policies.

**Option A: Python (Simplest)**
```bash
python3 -m http.server 8000
# Then open http://localhost:8000/standalone-tester/ in your browser
```

**Option B: VS Code Live Server**
1. Install the **"Live Server"** extension in VS Code.
2. Right-click `standalone-tester/index.html`.
3. Select **"Open with Live Server"**.

**Option C: Deploy to Web Server (Apache/Nginx)**
1. Copy the entire `standalone-tester` folder to your web root (e.g., `/var/www/html/`).
2. Ensure the `data/` directory has read permissions.
3. Access via `http://your-server-ip/standalone-tester/`.

---

## 🛠️ How It Works

1.  **Strict Validation**: The app listens to every word you say. It must match the *exact* sequence of the Quran.
2.  **No Skips Allowed**: If you skip a word, jump to the next Ayah, or start the next Surah, it stops you immediately.
3.  **Phonetic AI**: Even if you say the right word, if your pronunciation (vowels/tajweed) is too different from the reference audio, it counts as a mistake.

## 📂 Project Structure

- `quran-recitation-tracker/`: The main web application folder.
  - `index.html`: Main interface.
  - `app.js`: Core logic for speech recognition and AI analysis.
  - `data/`: Contains text JSON and audio files.
- `download_audio.py`: Script to fetch Quran audio files.
- `generate_phonetics.py`: Script to pre-calculate AI fingerprints.
- `.gitignore`: Configured to exclude heavy audio files.