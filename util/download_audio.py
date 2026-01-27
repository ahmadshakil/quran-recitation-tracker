import os
import json
import requests
import time

# Configuration
RECITER = "Alafasy_128kbps" # You can change this to your preferred reciter
BASE_URL = f"http://www.everyayah.com/data/{RECITER}/"
DATA_DIR = "backend/data/quran/audio"
MAPPING_FILE = "assets/hafs_smart_v8.json"

def download_audio():
    # Ensure data directory exists
    if not os.path.exists(DATA_DIR):
        os.makedirs(DATA_DIR)

    # Load Quran data to get ayah counts per surah
    with open(MAPPING_FILE, 'r', encoding='utf-8') as f:
        quran_data = json.load(f)

    # Build surah -> ayahs mapping
    surah_map = {}
    for entry in quran_data:
        sura = entry['sura_no']
        if sura not in surah_map:
            surah_map[sura] = []
        surah_map[sura].append(entry['aya_no'])

    # Download missing surahs (27 to 114)
    for sura in range(27, 115):
        sura_dir = os.path.join(DATA_DIR, str(sura))
        if not os.path.exists(sura_dir):
            os.makedirs(sura_dir)
            print(f"Created directory for Surah {sura}")
        
        ayahs = surah_map.get(sura, [])
        print(f"Downloading Surah {sura} ({len(ayahs)} ayahs)...")
        
        for ayah in ayahs:
            filename = f"{ayah}.mp3"
            filepath = os.path.join(sura_dir, filename)
            
            if os.path.exists(filepath):
                continue
                
            # format surah and ayah as 3 digits
            s_str = str(sura).zfill(3)
            a_str = str(ayah).zfill(3)
            url = f"{BASE_URL}{s_str}{a_str}.mp3"
            
            try:
                response = requests.get(url, stream=True)
                if response.status_code == 200:
                    with open(filepath, 'wb') as f:
                        for chunk in response.iter_content(chunk_size=1024):
                            if chunk:
                                f.write(chunk)
                    print(f"  Downloaded {sura}:{ayah}")
                else:
                    print(f"  Failed to download {sura}:{ayah} (Status: {response.status_code})")
            except Exception as e:
                print(f"  Error downloading {sura}:{ayah}: {e}")
            
            # Small delay to avoid hammering the server
            time.sleep(0.1)

if __name__ == "__main__":
    download_audio()
