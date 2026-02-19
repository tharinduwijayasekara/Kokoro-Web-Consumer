const DEFAULT_ORATOR_JSON = {
    orator: {
        config: {
            ttsUrl: "http://localhost:8888/v1/audio/speech",
            voice: "af_heart",
            speed: 1.25,
            appearance: {
                font: "serif",
                size: 18,
                line: 1.5,
                spacing: 1,
                color: "#222222",
                background: "#eeeeee",
                highlight: "#eeddbb"
            }
        },
        reading: {
            bookId: "chapterid::paragraphid::book-progress-percent"
        } // Empty initially
    }
};