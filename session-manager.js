/**
 * Session Manager
 * Handles saving and restoring the user's last selected Surah and Ayah range using LocalStorage.
 */
const SessionManager = {
    KEY: 'recitationState',

    // Load saved state or return empty object
    load() {
        try {
            const saved = localStorage.getItem(this.KEY);
            return saved ? JSON.parse(saved) : {};
        } catch (e) {
            console.warn("Failed to load session:", e);
            return {};
        }
    },

    // Save current state
    save(sura, from, to) {
        if (!sura) return;
        const state = { sura, from, to };
        console.log("Saving State:", state);
        localStorage.setItem(this.KEY, JSON.stringify(state));
    },

    // Check if we need to restore a specific range for the current loaded Surah
    shouldRestore(savedState, currentSuraNo) {
        return savedState.sura == currentSuraNo && savedState.from && savedState.to;
    },

    // Helper to generate <option> HTML with 'selected' attribute if matches saved state
    getOptionHtml(sura, savedSuraNo) {
        const selected = (savedSuraNo == sura.no) ? 'selected' : '';
        return `<option value="${sura.no}" ${selected}>${sura.no}. ${sura.name}</option>`;
    }
};
