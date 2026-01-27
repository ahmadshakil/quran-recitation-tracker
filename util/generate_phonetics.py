import os
import json
import librosa
import numpy as np

# Configuration
AUDIO_DIR = "standalone-tester/data/audio"
OUTPUT_DIR = "standalone-tester/data/phonetics"
N_MFCC = 13
HOP_LENGTH = 512 # Strategy to match Meyda.js buffer
WIN_LENGTH = 512

def generate_fingerprints():
    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)
        print(f"Created directory: {OUTPUT_DIR}")

    # Walk through sura folders
    for sura_folder in sorted(os.listdir(AUDIO_DIR)):
        sura_path = os.path.join(AUDIO_DIR, sura_folder)
        if not os.path.isdir(sura_path):
            continue
            
        print(f"Processing Surah {sura_folder}...")
        sura_data = {}
        
        for ayah_file in sorted(os.listdir(sura_path)):
            if not ayah_file.endswith(".mp3"):
                continue
                
            ayah_no = ayah_file.replace(".mp3", "")
            ayah_key = f"{sura_folder}_{ayah_no}"
            file_path = os.path.join(sura_path, ayah_file)
            
            try:
                # Load audio
                y, sr = librosa.load(file_path, sr=22050)
                
                # Extract MFCCs
                # We normalize to match browser audio context behavior
                mfccs = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=N_MFCC, 
                                           n_fft=WIN_LENGTH, hop_length=HOP_LENGTH)
                
                # Transpose and convert to list for JSON
                # Also trim silence based on energy (rms)
                rms = librosa.feature.rms(y=y, frame_length=WIN_LENGTH, hop_length=HOP_LENGTH)
                active_frames = []
                for i in range(mfccs.shape[1]):
                    if rms[0, i] > 0.01: # Energy threshold like app.js
                        active_frames.append(mfccs[:, i].tolist())
                
                sura_data[ayah_key] = active_frames
                
            except Exception as e:
                print(f"  Error on {ayah_key}: {e}")

        # Save one JSON file per Surah
        output_file = os.path.join(OUTPUT_DIR, f"{sura_folder}.json")
        with open(output_file, 'w') as f:
            json.dump(sura_data, f)
        print(f"  Saved {output_file}")

if __name__ == "__main__":
    generate_fingerprints()
