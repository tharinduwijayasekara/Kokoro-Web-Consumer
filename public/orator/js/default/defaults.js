const DEFAULT_ORATOR_JSON = {
    orator: {
        config: {
            ttsUrl: "https://kokoro.orator-audio.com/v1/audio/speech",
            voice: "af_heart(1)+af_aoede(1)+af_sky(1)",
            speed: 1.0,
            replacements: [],
            fontFamily: "Crimson Pro",
            fontSize: 14,
            lineHeight: 16,
            letterSpacing: 0,
            fontColor: "#ffffff",
            highlightColor: "#ffff00",
            backgroundColor: "#000000",
            libraryView: 'list',

        },
        reading: {
            bookId: "chapterid::paragraphid::book-progress-percent"
        } // Empty initially
    }
};

const DEFAULT_KOKORO_URL = 'https://kokoro.orator-audio.com/v1/audio/speech';

const DEFAULT_EDGE_TTS_URL = 'https://kokoroapp.orator-audio.com/edgetts/v1/audio/speech'

const KOKORO_VOICES = [
    "af_heart",
    "af_alloy",
    "af_aoede",
    "af_bella",
    "af_jessica",
    "af_kore",
    "af_nicole",
    "af_nova",
    "af_river",
    "af_sarah",
    "af_sky",
    "am_adam",
    "am_echo",
    "am_eric",
    "am_fenrir",
    "am_liam",
    "am_michael",
    "am_onyx",
    "am_puck",
    "am_santa",
    "bf_alice",
    "bf_emma",
    "bf_isabella",
    "bf_lily",
    "bm_daniel",
    "bm_fable",
    "bm_george",
    "bm_lewis"
];

const EDGETTS_VOICES = [
    'en-US-AvaNeural',
    'en-US-BrianNeural'
];

const ORATOR_MESSAGES = [
    "Clearing throat like starting a romance.",
    "Sipping tea before the plot thickens.",
    "Practicing dramatic page-turn gestures.",
    "Arguing with characters over bad decisions.",
    "Warming up with sassy tongue twisters.",
    "Adjusting chair like it’s a royal throne.",
    "Humming theme music for the heroine.",
    "Sipping coffee before the next cliffhanger.",
    "Testing microphone with fake gasps at plot twist.",
    "Reading love letter like Shakespeare wrote it.",
    "Polishing invisible crown before narrating.",
    "Whispering sweet prologue lines to microphone.",
    "Practicing villain laugh for steamy scene.",
    "Flexing jaw for long romantic monologues.",
    "Naming each chapter like an old flame.",
    "Rehearsing “Chapter One” with sultry tone.",
    "Battling squeaky chair before dramatic reveal.",
    "Negotiating with stomach before big scene.",
    "Adjusting mic stand like stage lighting.",
    "Shaking hands with the pop filter.",
    "Taking deep breath before the plot explodes.",
    "Asking self for most alluring narrator voice.",
    "Checking if voice drips with mystery.",
    "Stretching mouth for rapid-fire dialogue.",
    "Channeling inner Shakespeare for forbidden romance.",
    "Reading aloud to imaginary book club.",
    "Whispering like a delicious secret in chapter two.",
    "Hyping self up for dramatic finale.",
    "Pretending microphone is the romantic lead.",
    "Imagining applause after epic ending.",
    "Playing air guitar to audiobook soundtrack.",
    "Glaring at script for sneaky typos.",
    "Practicing crying for tragic last chapter.",
    "Reading with royal British fairy-tale flair.",
    "Trying cowboy drawl for Western romance.",
    "Arguing with reflection over character choices.",
    "Checking if voice can still seduce the plot.",
    "Pacing like a ghost in chapter twelve.",
    "Chuckling wickedly before romantic plot twist.",
    "Sipping water like it’s enchanted potion.",
    "Reading sentence backward for secret clue.",
    "Testing mic with dramatic book title.",
    "Narrating own life like epic novel.",
    "Overpronouncing for maximum audiobook drama.",
    "Attempting French accent for Paris love story.",
    "Reading script upside down confidently.",
    "Giving microphone a stern narrator warning.",
    "Imagining award for most addictive voice.",
    "Whispering too deliciously for the mystery chapter.",
    "Preparing for marathon chapter with no breaks."
];

const ORATOR_FONTS = [
    "Athelas",
    "BradleyHand",
    "Crimson Pro",
    "EB Garamond",
    "Libre Caslon Text",
    "Radley",
    "Handlee"
];