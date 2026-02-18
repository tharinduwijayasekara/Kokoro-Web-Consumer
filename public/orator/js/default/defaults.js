const DEFAULT_ORATOR_JSON = {
    orator: {
        config: {
            tts: {
                url: "http://localhost:8888/v1/audio/speech",
                params: {
                    voice: "af_heart",
                    speed: 1.1
                }
            },
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