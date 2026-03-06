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
            fontColor: "#000000",
            highlightColor: "#AAC7AA",
            backgroundColor: "#dddddd",
            libraryView: 'list',

        },
        reading: {
            bookId: "chapterid::paragraphid::book-progress-percent"
        },
        currentlyReading: 'bookid',
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

const ORATOR_P_CONTD = "##::##::ATTACH_TO_PREV_SPAN::##::##";

const SPINAL_WARNING = [
    "Dear Reader",
    "During the import process for this book I was not able to find any information on chapter sorting.",
    "I have done my best to judge the order, but I may make mistakes.",
    "And as I do not wish for you to jump straight into what might possibly be the final chapter in the book, and to spoilers galore.",
    "I humbly invite you to double-check the chapter order by pressing the chapters button (the one furthest away on the left of the play button).",
    "Warmest regards, and all my love from The Orator Developer, from Sri Lanka!"
];

const LIBRARY_CURRENT_READ_TITLES = [
    // The BookTok / Gen-Z Aesthetic
    "Currently Reading",
    "In My Reading Era",
    "Current Obsession",
    "POV: You're finishing this",
    "The Current Vibe",
    "Reading Status: Hooked",

    // Emotional / Cozy
    "Back into the story...",
    "Where we left off",
    "Your current escape",
    "Snuggled up with...",
    "Lost in the plot",
    "A masterpiece in progress",

    // High-Energy / Addictive
    "Just one more chapter...",
    "Still obsessed",
    "The one you can't stop",
    "Can't put this down",
    "Main Character Energy",

    // Minimalist / Clean
    "Now Playing",
    "Continue Listening",
    "Current Read",

    "Ah! Temptation!",
    "Always forward, always down...",
    "One does not simply not read another chapter"
];