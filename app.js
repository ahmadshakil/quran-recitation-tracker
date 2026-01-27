$(document).ready(function () {
    let recognition = null;
    let isReciting = false;
    let surahAyahs = [];
    let currentAyahIndex = 0;
    let quranData = [];
    let surasMetadata = [];
    let expectedWordIndex = 0;
    let silenceTimer = null;
    let isTransitioning = false;
    const SILENCE_TIMEOUT = 3000; // 3 seconds

    // Audio Analysis Variables
    let audioContext = null;
    let analyzer = null;
    let referenceFeatures = {}; // Store MFCCs per ayah
    let liveFeatures = []; // Buffer for current recitation features

    // IndexedDB Setup for Sound Fingerprints
    const DB_NAME = 'PhoneticsCache';
    const STORE_NAME = 'fingerprints';
    let db = null;

    const initDB = () => {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, 1);
            request.onerror = e => reject(e);
            request.onsuccess = e => { db = e.target.result; resolve(db); };
            request.onupgradeneeded = e => {
                e.target.result.createObjectStore(STORE_NAME);
            };
        });
    };

    const getFingerprint = (key) => {
        return new Promise(resolve => {
            if (!db) return resolve(null);
            const txn = db.transaction(STORE_NAME, 'readonly');
            const store = txn.objectStore(STORE_NAME);
            const req = store.get(key);
            req.onsuccess = () => resolve(req.result);
        });
    };

    const saveFingerprint = (key, data) => {
        if (!db) return;
        const txn = db.transaction(STORE_NAME, 'readwrite');
        const store = txn.objectStore(STORE_NAME);
        store.put(data, key);
    };

    const $suraSelect = $('#suraSelect');
    const $fromAyah = $('#fromAyah');
    const $toAyah = $('#toAyah');
    const $startBtn = $('#startBtn');
    const $stopBtn = $('#stopBtn');
    const $ayahText = $('#ayahText');
    const $ayahInfo = $('#ayahInfo');
    const $statusText = $('#statusText');
    const $audioWave = $('#audioWave');
    const $progressBarFill = $('#progressBarFill');
    const $overallProgress = $('#overallProgress');
    const $preloadStatus = $('#preloadStatus');
    const $preloadText = $('#preloadText');
    const audioPlayer = document.getElementById('originalAudio');

    // Load State from SessionManager (Moved to top)
    const savedState = SessionManager.load();
    console.log("Loaded Saved State:", savedState);

    // Initialize - Load Local JSON
    loadLocalData();

    function loadLocalData() {
        $suraSelect.empty().append('<option value="">جاري تحميل البيانات...</option>');
        $.getJSON('data/quran.json', function (data) {
            quranData = data;

            const seenSuras = new Set();
            surasMetadata = [];
            quranData.forEach(aya => {
                if (!seenSuras.has(aya.sura_no)) {
                    seenSuras.add(aya.sura_no);
                    surasMetadata.push({
                        no: aya.sura_no,
                        name: aya.sura_name_ar
                    });
                }
            });

            $suraSelect.empty().append('<option value="">اختر السورة...</option>');
            surasMetadata.forEach(sura => {
                const html = SessionManager.getOptionHtml(sura, savedState.sura);
                $suraSelect.append(html);
            });

            // Trigger change if we have a saved surah to load its ayahs
            if (savedState.sura) {
                console.log("Triggering auto-select for Surah:", savedState.sura);
                $suraSelect.trigger('change');
            }
        }).fail(function () {
            $suraSelect.empty().append('<option value="">فشل تحميل البيانات</option>');
            console.error("Failed to load data/quran.json. Ensure you are running through a web server.");
        });
    }

    $suraSelect.on('change', function () {
        const suraNo = parseInt($(this).val());
        console.log("Surah Changed to:", suraNo);
        if (suraNo) {
            const allSurahAyahs = quranData.filter(aya => aya.sura_no === suraNo);
            populateAyahSelects(allSurahAyahs);

            // Restore range if matches saved surah
            if (SessionManager.shouldRestore(savedState, suraNo)) {
                console.log("Restoring saved range:", savedState.from, "to", savedState.to);
                $fromAyah.val(savedState.from);
                $toAyah.val(savedState.to);
                savedState.from = null; // Clear to prevent sticky state
            }

            resetUI();
            $ayahInfo.text(`تم اختيار سورة ${allSurahAyahs[0].sura_name_ar}. اضبط المدى واضغط ابدأ.`);
            preloadAudioRange();
            SessionManager.save(suraNo, $fromAyah.val(), $toAyah.val());
        } else {
            resetUI();
            $fromAyah.empty().append('<option value="1">1</option>');
            $toAyah.empty().append('<option value="">--</option>');
            SessionManager.save(null, null, null);
        }
    });

    $fromAyah.on('change', () => {
        preloadAudioRange();
        SessionManager.save($suraSelect.val(), $fromAyah.val(), $toAyah.val());
    });

    $toAyah.on('change', () => {
        preloadAudioRange();
        SessionManager.save($suraSelect.val(), $fromAyah.val(), $toAyah.val());
    });


    function populateAyahSelects(ayahs) {
        $fromAyah.empty();
        $toAyah.empty();
        ayahs.forEach(aya => {
            $fromAyah.append(`<option value="${aya.aya_no}">${aya.aya_no}</option>`);
            $toAyah.append(`<option value="${aya.aya_no}">${aya.aya_no}</option>`);
        });
        $fromAyah.val(1);
        $toAyah.val(ayahs.length);
    }

    function renderCurrentAyah() {
        const ayah = surahAyahs[currentAyahIndex];
        if (!ayah) return;

        $ayahInfo.text(`سورة ${ayah.sura_name_ar} - آية ${ayah.aya_no}`);
        expectedWordIndex = 0;
        isTransitioning = false;

        const words = ayah.aya_text_emlaey.split(/\s+/);
        let html = '';
        words.forEach((word, index) => {
            html += `<span class="quran-word hidden" data-index="${index}">${word}</span> `;
        });
        $ayahText.html(html);
        resetSilenceTimer();
    }

    function updateProgress() {
        if (surahAyahs.length === 0) return;
        const percent = ((currentAyahIndex) / surahAyahs.length) * 100;
        $progressBarFill.css('width', `${percent}%`);
        $overallProgress.text(`آية ${currentAyahIndex + 1} من ${surahAyahs.length}`);
    }

    function resetUI() {
        $ayahText.empty();
        $ayahInfo.text('يرجى اختيار سورة للبدء');
        $progressBarFill.css('width', '0%');
        $overallProgress.text('آية 0 من 0');
        clearTimeout(silenceTimer);
    }

    function resetSilenceTimer() {
        if (!isReciting || isTransitioning) {
            clearTimeout(silenceTimer);
            return;
        }
        clearTimeout(silenceTimer);
        silenceTimer = setTimeout(() => {
            if (isReciting) {
                console.log("Mistake/Silence timeout");
                $statusText.text('تجاوز الوقت... استمع للتصحيح');
                handleMistake();
            }
        }, SILENCE_TIMEOUT);
    }

    // Initialize Web Speech API
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'ar-SA';

        recognition.onresult = (event) => {
            if (isTransitioning) return;
            let interimTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    processSpeech(transcript, true);
                } else {
                    interimTranscript += transcript;
                }
            }
            if (interimTranscript) {
                $statusText.text('تسمع: ' + interimTranscript);
                processSpeech(interimTranscript, false);
            }
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            if (event.error === 'no-speech') {
                $statusText.text('لم يتم اكتشاف صوت');
            }
        };

        recognition.onend = () => {
            if (isReciting) recognition.start();
        };
    } else {
        alert('متصفحك لا يدعم خاصية التعرف على الصوت. يرجى استخدام متصفح Chrome.');
    }

    $startBtn.on('click', async () => {
        const suraNo = parseInt($suraSelect.val());
        if (!suraNo) return alert('الرجاء اختيار سورة أولاً');

        const from = parseInt($fromAyah.val());
        const to = parseInt($toAyah.val());

        if (from > to) return alert('بداية المجال يجب أن تكون أقل من نهايته');

        surahAyahs = quranData.filter(aya => aya.sura_no === suraNo && aya.aya_no >= from && aya.aya_no <= to);
        currentAyahIndex = 0;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            if (!audioContext) audioContext = new AudioContext();
            if (audioContext.state === 'suspended') await audioContext.resume();

            const source = audioContext.createMediaStreamSource(stream);
            analyzer = Meyda.createMeydaAnalyzer({
                audioContext: audioContext,
                source: source,
                bufferSize: 512,
                featureExtractors: ['mfcc', 'rms'],
                callback: features => {
                    if (features.rms > 0.01) {
                        liveFeatures.push(features.mfcc);
                        if (liveFeatures.length > 500) liveFeatures.shift();
                    }
                }
            });
            analyzer.start();

            isReciting = true;
            renderCurrentAyah();
            updateProgress();

            recognition.start();
            $startBtn.hide();
            $stopBtn.show();
            $statusText.text('جاري الاستماع...');
            $audioWave.show();
            resetSilenceTimer();

        } catch (err) {
            console.error('Mic access error:', err);
            alert('تعذر الوصول إلى الميكروفون أو السماح بالتحليل الصوتي');
        }
    });

    $stopBtn.on('click', () => {
        isReciting = false;
        if (recognition) recognition.stop();
        if (analyzer) analyzer.stop();
        $startBtn.show();
        $stopBtn.hide();
        $statusText.text('توقفت التلاوة');
        $audioWave.hide();
        clearTimeout(silenceTimer);
        liveFeatures = [];
    });

    function processSpeech(transcript, isFinal) {
        if (!isReciting || isTransitioning) return;

        const normalizedTranscript = normalizeArabic(transcript);
        const spokenWords = normalizedTranscript.split(/\s+/).filter(w => w.length > 0);

        const currentAyah = surahAyahs[currentAyahIndex];
        const targetWords = normalizeArabic(currentAyah.aya_text_emlaey).split(/\s+/);

        // CRITICAL FIX: Only process new words that haven't been "consumed" yet
        // In this simple loop, we just check the *first* matching word and stop.
        // This prevents "Allah Allah" in one breath from triggering 2 matches instantly if only 1 was expected.

        let processedWordCount = 0;

        for (let word of spokenWords) {
            // STRICT SEQUENCE: Word must match EXACTLY the next expected word
            if (word === targetWords[expectedWordIndex]) {
                if (performPhoneticCheck(expectedWordIndex)) {
                    $(`.quran-word[data-index="${expectedWordIndex}"]`).removeClass('hidden').addClass('correct');
                    expectedWordIndex++;
                    processedWordCount++;

                    resetSilenceTimer();
                    checkAyahCompletion();

                    // Break after ONE successful word match per event to prevent "running ahead" too fast
                    // or matching duplicate words in the same transcript chunk incorrectly.
                    if (processedWordCount >= 1) break;
                } else if (isFinal) {
                    console.log("Phonetic mismatch detected on final result");
                    handleMistake();
                    return;
                }
            } else if (isFinal) {
                // Final result mismatch (Skip, Wrong Word, etc.)
                if (word.length > 2) {
                    console.log(`Mismatch: Spoken "${word}", Expected "${targetWords[expectedWordIndex]}"`);
                    handleMistake();
                    return;
                }
            }
        }
    }

    function performPhoneticCheck(wordIndex) {
        const currentAyah = surahAyahs[currentAyahIndex];
        const ayahKey = `${currentAyah.sura_no}_${currentAyah.aya_no}`;
        const ref = referenceFeatures[ayahKey];
        if (!ref || liveFeatures.length < 10) return true; // Fallback if no reference

        // Measure similarity using DTW
        const liveSegment = liveFeatures.slice(-30);
        const dist = dtwDistance(liveSegment, ref);

        console.log(`Phonetic distance for word ${wordIndex}: ${dist.toFixed(2)}`);

        // REFINED THRESHOLD: 45.0 is much stricter than 80.0
        return dist < 45.0;
    }

    function dtwDistance(s1, s2) {
        const n = s1.length;
        const m = s2.length;
        if (n === 0 || m === 0) return 999;

        const dtw = Array.from({ length: n + 1 }, () => Array(m + 1).fill(Infinity));
        dtw[0][0] = 0;

        for (let i = 1; i <= n; i++) {
            for (let j = 1; j <= m; j++) {
                const cost = euclideanDistance(s1[i - 1], s2[j - 1]);
                dtw[i][j] = cost + Math.min(dtw[i - 1][j], dtw[i][j - 1], dtw[i - 1][j - 1]);
            }
        }
        return dtw[n][m] / (n + m);
    }

    function euclideanDistance(v1, v2) {
        return Math.sqrt(v1.reduce((sum, val, i) => sum + Math.pow(val - v2[i], 2), 0));
    }

    function normalizeArabic(text) {
        if (!text) return "";
        return text
            .replace(/[إأآا]/g, 'ا')
            .replace(/[ىي]/g, 'ي')
            .replace(/[ةه]/g, 'ه')
            .replace(/[^\u0621-\u064A\s]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function checkAyahCompletion() {
        const totalWords = surahAyahs[currentAyahIndex].aya_text_emlaey.split(/\s+/).length;
        if (expectedWordIndex === totalWords && !isTransitioning) {
            isTransitioning = true;
            $statusText.text('أحسنتم! ننتقل للآية التالية...');
            setTimeout(moveToNextAyah, 1500);
        }
    }

    function moveToNextAyah() {
        if (!isReciting) return;
        if (currentAyahIndex < surahAyahs.length - 1) {
            currentAyahIndex++;
            renderCurrentAyah();
            updateProgress();
            $statusText.text('جاري الاستماع للآية التالية...');
        } else {
            alert('تم إنهاء المجال المحدد بنجاح!');
            $stopBtn.click();
        }
    }

    async function preloadAudioRange() {
        const suraNo = parseInt($suraSelect.val());
        const from = parseInt($fromAyah.val());
        const to = parseInt($toAyah.val());

        if (!suraNo || !from || !to || from > to) return;

        $preloadStatus.show();
        $preloadText.text('جاري فحص الملفات...');

        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        // 1. Try to load Pre-calculated Static JSON first (Fastest)
        const staticJsonUrl = `data/phonetics/${suraNo}.json`;
        try {
            const staticRes = await fetch(staticJsonUrl);
            if (staticRes.ok) {
                const staticData = await staticRes.json();
                Object.assign(referenceFeatures, staticData);
                $preloadText.text('تم تحميل البصمات الجاهزة');
                setTimeout(() => $preloadStatus.fadeOut(), 2000);
                return; // Everything loaded from disk!
            }
        } catch (e) {
            console.log("No static fingerprints found, starting manual check...");
        }

        // 2. Fallback to Cache / Manual Training (Original Logic)
        const cache = await caches.open('quran-audio-cache');
        const totalToLoad = to - from + 1;
        let loadedCount = 0;

        const batchSize = 3;
        for (let i = from; i <= to; i += batchSize) {
            const batchPromises = [];
            for (let j = i; j < i + batchSize && j <= to; j++) {
                const url = `data/audio/${suraNo}/${j}.mp3`;
                const ayahKey = `${suraNo}_${j}`;

                batchPromises.push(
                    (async () => {
                        try {
                            let response = await cache.match(url);
                            let wasCached = !!response;
                            let storedPhonetics = await getFingerprint(ayahKey);

                            if (storedPhonetics) {
                                referenceFeatures[ayahKey] = storedPhonetics;
                                loadedCount++;
                                $preloadText.text(`جاري استعادة: ${loadedCount}/${totalToLoad}`);
                            } else {
                                if (!response) {
                                    response = await fetch(url);
                                    if (!response.ok) throw new Error('Fetch failed');
                                    await cache.put(url, response.clone());
                                }

                                const buffer = await response.arrayBuffer();
                                const audioBuffer = await audioContext.decodeAudioData(buffer);
                                const features = extractMFCCs(audioBuffer);

                                referenceFeatures[ayahKey] = features;
                                saveFingerprint(ayahKey, features);

                                loadedCount++;
                                const statusMsg = wasCached ? 'تدريب' : 'تحميل';
                                $preloadText.text(`جاري ${statusMsg}: ${loadedCount}/${totalToLoad}`);
                            }
                        } catch (err) {
                            console.warn(`Failed to process ${url}`, err);
                        }
                    })()
                );
            }
            await Promise.all(batchPromises);
        }

        $preloadText.text('تم تحميل وتدريب الآيات');
        setTimeout(() => {
            if (loadedCount === totalToLoad) {
                $preloadStatus.fadeOut();
            }
        }, 3000);
    }

    function extractMFCCs(audioBuffer) {
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;

        const offlineCtx = new OfflineAudioContext(
            audioBuffer.numberOfChannels,
            audioBuffer.length,
            audioBuffer.sampleRate
        );

        const offlineSource = offlineCtx.createBufferSource();
        offlineSource.buffer = audioBuffer;

        // Meyda configuration for offline analysis
        const bufferSize = 512;
        const features = [];

        // We manually step through the buffer since Meyda extract() usually works on live nodes
        // Alternatively, use a temporary script processor or just slice the channel data
        const channelData = audioBuffer.getChannelData(0);

        for (let i = 0; i < channelData.length; i += bufferSize) {
            const slice = channelData.slice(i, i + bufferSize);
            if (slice.length < bufferSize) break;

            // Basic energy check to skip silence in reference
            const energy = Meyda.extract('rms', slice);
            if (energy > 0.01) {
                const mfcc = Meyda.extract('mfcc', slice);
                if (mfcc) features.push(mfcc);
            }
        }
        return features;
    }

    function handleMistake() {
        if (!isReciting || isTransitioning) return;
        playOriginalRecitation();
    }

    function playOriginalRecitation() {
        const ayah = surahAyahs[currentAyahIndex];
        const audioUrl = `data/audio/${ayah.sura_no}/${ayah.aya_no}.mp3`;

        $statusText.text('أكمل الآية... استمع للأصل');
        $statusText.css('color', 'var(--error-color)');

        audioPlayer.src = audioUrl;
        audioPlayer.play().catch(e => {
            console.error('Audio play error:', e);
            alert('تعذر تشغيل الملف الصوتي.');
        });

        audioPlayer.onended = () => {
            if (isReciting) {
                $statusText.text('جاري الاستماع...');
                $statusText.css('color', 'var(--text-muted)');
                resetSilenceTimer();
            }
        };
    }
});
