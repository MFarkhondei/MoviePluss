import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  CirclePause,
  CirclePlay,
  Film,
  Maximize,
  Minimize,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Settings,
  SkipBack,
  SkipForward,
  Subtitles,
  Volume1,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";

import "vazirmatn/Vazirmatn-font-face.css";

const COLORS = {
  bg: "#0D0F15",
  panel: "#171A23",
  card: "#202532",
  active: "#2C3447",
  border: "#343B4D",
  text: "#F2F0EA",
  muted: "#9299AA",
  yellow: "#F2C94C",
  teal: "#4FD9C0",
};

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

const ENCODINGS = [
  { value: "utf-8", label: "UTF-8" },
  { value: "windows-1256", label: "Windows-1256" },
  { value: "iso-8859-6", label: "ISO-8859-6" },
  { value: "windows-1252", label: "Windows-1252" },
];

function timeToSeconds(value = "") {
  const parts = value.trim().replace(",", ".").split(":").map(Number);

  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }

  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }

  return Number(parts[0]) || 0;
}

function formatTime(value = 0) {
  if (!Number.isFinite(value)) return "00:00";

  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = Math.floor(value % 60);

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(
      minutes
    ).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(
    seconds
  ).padStart(2, "0")}`;
}

function parseSubtitleText(raw = "") {
  if (!raw.trim()) return [];

  return raw
    .replace(/\r/g, "")
    .replace(/^WEBVTT.*\n+/i, "")
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split("\n");
      const timeIndex = lines.findIndex((line) =>
        line.includes("-->")
      );

      if (timeIndex === -1) return null;

      const times = lines[timeIndex].split("-->");
      const start = timeToSeconds(times[0]);
      const end = timeToSeconds(
        times[1]?.trim().split(/\s+/)[0]
      );

      const text = lines
        .slice(timeIndex + 1)
        .join(" ")
        .replace(/<[^>]+>/g, "")
        .trim();

      if (!text) return null;

      return {
        start,
        end,
        text,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start);
}

function mergeSubtitles(englishText, persianText) {
  const english = parseSubtitleText(englishText);
  const persian = parseSubtitleText(persianText);

  const total = Math.max(english.length, persian.length);

  return Array.from({ length: total }, (_, index) => {
    const en = english[index];
    const fa = persian[index];
    const base = en || fa;

    return {
      index: index + 1,
      start: base?.start || 0,
      end: base?.end || 0,
      en: en?.text || "",
      fa: fa?.text || "",
    };
  });
}

function decodeBuffer(buffer, encoding) {
  try {
    return new TextDecoder(encoding).decode(buffer);
  } catch {
    return new TextDecoder("utf-8").decode(buffer);
  }
}

async function autoDecodeFile(file) {
  const buffer = await file.arrayBuffer();
  const utf8 = new TextDecoder("utf-8").decode(buffer);
  const invalidChars = utf8.match(/\uFFFD/g)?.length || 0;

  if (invalidChars > 3) {
    return {
      text: decodeBuffer(buffer, "windows-1256"),
      encoding: "windows-1256",
    };
  }

  return {
    text: utf8,
    encoding: "utf-8",
  };
}

async function decodeFile(file, encoding) {
  const buffer = await file.arrayBuffer();
  return decodeBuffer(buffer, encoding);
}

export default function MoviePluss() {
  const videoRef = useRef(null);
  const playerRef = useRef(null);
  const cardsRef = useRef(null);
  const translationRef = useRef(null);

  const cuesRef = useRef([]);
  const currentCueRef = useRef(-1);
  const repeatRef = useRef(false);

  const translationDragRef = useRef(null);
  const translationCacheRef = useRef({});
  const hideControlsTimerRef = useRef(null);

  const [videoUrl, setVideoUrl] = useState("");
  const [videoName, setVideoName] = useState("");

  const [englishFile, setEnglishFile] = useState(null);
  const [persianFile, setPersianFile] = useState(null);

  const [englishText, setEnglishText] = useState("");
  const [persianText, setPersianText] = useState("");

  const [englishEncoding, setEnglishEncoding] =
    useState("utf-8");
  const [persianEncoding, setPersianEncoding] =
    useState("utf-8");

  const [cues, setCues] = useState([]);
  const [currentCue, setCurrentCue] = useState(-1);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [playbackRate, setPlaybackRate] = useState(1);

  const [repeatOn, setRepeatOn] = useState(false);
  const [showEnglish, setShowEnglish] = useState(true);
  const [showPersian, setShowPersian] = useState(true);

  const [filesOpen, setFilesOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);

  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [subtitleSize, setSubtitleSize] = useState(100);
  const [subtitleBottom, setSubtitleBottom] = useState(14);
  const [subtitleBackground, setSubtitleBackground] =
    useState(true);

  const [wordPopup, setWordPopup] = useState(null);

  /*
    پنجره ترجمه ابتدا در بالا سمت راست فیلم قرار می‌گیرد.
    چون داخل player قرار دارد، در حالت تمام‌صفحه نیز نمایش داده می‌شود.
  */
  const [translationPosition, setTranslationPosition] =
    useState({
      top: 18,
      right: 18,
      left: null,
    });

  const activeCue =
    currentCue >= 0 ? cues[currentCue] : null;

  useEffect(() => {
    cuesRef.current = cues;
  }, [cues]);

  useEffect(() => {
    currentCueRef.current = currentCue;
  }, [currentCue]);

  useEffect(() => {
    repeatRef.current = repeatOn;
  }, [repeatOn]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(
        document.fullscreenElement === playerRef.current
      );
    };

    document.addEventListener(
      "fullscreenchange",
      onFullscreenChange
    );

    return () => {
      document.removeEventListener(
        "fullscreenchange",
        onFullscreenChange
      );
    };
  }, []);

  useEffect(() => {
    if (currentCue >= 0 && cardsRef.current) {
      cardsRef.current
        .querySelector(`[data-card="${currentCue}"]`)
        ?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "nearest",
        });
    }
  }, [currentCue]);

  useEffect(() => {
    return () => {
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
      }
    };
  }, [videoUrl]);

  const showControlsTemporarily = useCallback(() => {
    setControlsVisible(true);
    clearTimeout(hideControlsTimerRef.current);

    if (isPlaying) {
      hideControlsTimerRef.current = setTimeout(() => {
        setControlsVisible(false);
      }, 3500);
    }
  }, [isPlaying]);

  useEffect(() => {
    showControlsTemporarily();

    return () => clearTimeout(hideControlsTimerRef.current);
  }, [isPlaying, showControlsTemporarily]);

  const playVideo = useCallback(async () => {
    if (!videoRef.current) return;

    try {
      await videoRef.current.play();
      setIsPlaying(true);
      showControlsTemporarily();
    } catch {
      setIsPlaying(false);
    }
  }, [showControlsTemporarily]);

  const pauseVideo = useCallback(() => {
    videoRef.current?.pause();
    setIsPlaying(false);
    setControlsVisible(true);
  }, []);

  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;

    if (videoRef.current.paused) {
      playVideo();
    } else {
      pauseVideo();
    }
  }, [playVideo, pauseVideo]);

  const seekBy = useCallback(
    (seconds) => {
      if (!videoRef.current) return;

      const nextTime = Math.max(
        0,
        Math.min(
          duration || videoRef.current.duration || 0,
          videoRef.current.currentTime + seconds
        )
      );

      videoRef.current.currentTime = nextTime;
      setCurrentTime(nextTime);
      showControlsTemporarily();
    },
    [duration, showControlsTemporarily]
  );

  const seekTo = (value) => {
    if (!videoRef.current) return;

    const nextTime = Number(value);

    videoRef.current.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  const jumpToCue = useCallback(
    (index, autoplay = true) => {
      const cue = cuesRef.current[index];

      if (!cue || !videoRef.current) return;

      currentCueRef.current = index;
      setCurrentCue(index);
      setWordPopup(null);

      videoRef.current.currentTime = cue.start;

      if (autoplay) {
        playVideo();
      }
    },
    [playVideo]
  );

  /*
    کارت‌ها از سمت چپ شروع می‌شوند.
    دکمه «کارت قبلی» در سمت راست قرار دارد.
    دکمه «کارت بعدی» در سمت چپ قرار دارد.
  */
  const goToPreviousCard = useCallback(() => {
    const previousIndex = currentCueRef.current - 1;

    if (previousIndex >= 0) {
      jumpToCue(previousIndex, true);
    } else if (videoRef.current) {
      videoRef.current.currentTime = 0;
      setCurrentTime(0);
    }
  }, [jumpToCue]);

  const goToNextCard = useCallback(() => {
    const nextIndex = currentCueRef.current + 1;

    if (nextIndex < cuesRef.current.length) {
      jumpToCue(nextIndex, true);
    }
  }, [jumpToCue]);

  const replayCurrentCard = useCallback(() => {
    if (currentCueRef.current >= 0) {
      jumpToCue(currentCueRef.current, true);
    }
  }, [jumpToCue]);

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;

    const time = videoRef.current.currentTime;
    setCurrentTime(time);

    const list = cuesRef.current;
    const index = currentCueRef.current;

    /*
      در حالت تکرار، پخش از ابتدای کارت جاری شروع می‌شود
      و تا ابتدای کارت بعدی ادامه پیدا می‌کند.
    */
    if (repeatRef.current && index >= 0 && list[index]) {
      const current = list[index];
      const next = list[index + 1];

      const boundary = next ? next.start : current.end;

      if (time >= boundary - 0.04) {
        videoRef.current.currentTime = current.start;
        return;
      }
    }

    const detectedIndex = list.findIndex(
      (cue) => time >= cue.start && time < cue.end
    );

    if (
      detectedIndex !== -1 &&
      detectedIndex !== currentCueRef.current
    ) {
      currentCueRef.current = detectedIndex;
      setCurrentCue(detectedIndex);
    }
  };

  const handleVideoLoaded = () => {
    if (!videoRef.current) return;

    setDuration(videoRef.current.duration || 0);
    videoRef.current.volume = volume;
    videoRef.current.playbackRate = playbackRate;
  };

  const handleVideoFile = (file) => {
    if (!file) return;

    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
    }

    const url = URL.createObjectURL(file);

    setVideoUrl(url);
    setVideoName(file.name);
    setCurrentTime(0);
    setDuration(0);
    setCurrentCue(-1);
    setIsPlaying(false);
    setWordPopup(null);

    currentCueRef.current = -1;
  };

  const handleSubtitleFile = async (file, language) => {
    if (!file) return;

    const result = await autoDecodeFile(file);

    if (language === "en") {
      setEnglishFile(file);
      setEnglishEncoding(result.encoding);
      setEnglishText(result.text);
    } else {
      setPersianFile(file);
      setPersianEncoding(result.encoding);
      setPersianText(result.text);
    }
  };

  const changeSubtitleEncoding = async (
    language,
    encoding
  ) => {
    if (language === "en") {
      setEnglishEncoding(encoding);

      if (englishFile) {
        setEnglishText(
          await decodeFile(englishFile, encoding)
        );
      }
    } else {
      setPersianEncoding(encoding);

      if (persianFile) {
        setPersianText(
          await decodeFile(persianFile, encoding)
        );
      }
    }
  };

  const applySubtitles = () => {
    const merged = mergeSubtitles(
      englishText,
      persianText
    );

    setCues(merged);
    cuesRef.current = merged;
    setCurrentCue(-1);
    currentCueRef.current = -1;
  };

  const changeVolume = (value) => {
    const nextVolume = Number(value);

    setVolume(nextVolume);
    setIsMuted(nextVolume === 0);

    if (videoRef.current) {
      videoRef.current.volume = nextVolume;
      videoRef.current.muted = nextVolume === 0;
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;

    const nextMuted = !isMuted;

    videoRef.current.muted = nextMuted;
    setIsMuted(nextMuted);

    if (!nextMuted && volume === 0) {
      setVolume(1);
      videoRef.current.volume = 1;
    }
  };

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await playerRef.current?.requestFullscreen();
      }
    } catch (error) {
      console.error(error);
    }
  };

  const translateWord = async (rawWord) => {
    const word = rawWord
      .replace(/[^A-Za-z'-]/g, "")
      .trim();

    if (!word) return;

    const key = word.toLowerCase();

    if (translationCacheRef.current[key]) {
      setWordPopup({
        word,
        translation: translationCacheRef.current[key],
        loading: false,
      });

      return;
    }

    setWordPopup({
      word,
      translation: "",
      loading: true,
    });

    try {
      const response = await fetch(
        `https://api.mymemory.translated.net/get?q=${encodeURIComponent(
          word
        )}&langpair=en|fa`
      );

      const data = await response.json();

      const translation =
        data?.responseData?.translatedText ||
        "ترجمه پیدا نشد";

      translationCacheRef.current[key] = translation;

      setWordPopup({
        word,
        translation,
        loading: false,
      });
    } catch {
      setWordPopup({
        word,
        translation: "خطا در دریافت ترجمه",
        loading: false,
      });
    }
  };

  const renderEnglish = (text, prefix) => {
    return text.split(/(\s+)/).map((token, index) => {
      if (/^\s+$/.test(token)) return token;

      return (
        <span
          key={`${prefix}-${index}`}
          onClick={(event) => {
            event.stopPropagation();
            translateWord(token);
          }}
          title="برای ترجمه کلیک کنید"
          style={{
            cursor: "pointer",
            borderBottom: `1px dotted ${COLORS.yellow}`,
          }}
        >
          {token}
        </span>
      );
    });
  };

  const handleTranslationPointerDown = (event) => {
    if (!translationRef.current || !playerRef.current) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const popupRect =
      translationRef.current.getBoundingClientRect();

    translationDragRef.current = {
      active: true,
      offsetX: event.clientX - popupRect.left,
      offsetY: event.clientY - popupRect.top,
    };
  };

  const handleTranslationPointerMove = useCallback(
    (event) => {
      if (
        !translationDragRef.current?.active ||
        !translationRef.current ||
        !playerRef.current
      ) {
        return;
      }

      const playerRect =
        playerRef.current.getBoundingClientRect();

      const popupRect =
        translationRef.current.getBoundingClientRect();

      let left =
        event.clientX -
        playerRect.left -
        translationDragRef.current.offsetX;

      let top =
        event.clientY -
        playerRect.top -
        translationDragRef.current.offsetY;

      left = Math.max(
        8,
        Math.min(
          left,
          playerRect.width - popupRect.width - 8
        )
      );

      top = Math.max(
        8,
        Math.min(
          top,
          playerRect.height - popupRect.height - 8
        )
      );

      setTranslationPosition({
        top,
        left,
        right: null,
      });
    },
    []
  );

  const handleTranslationPointerUp = useCallback(() => {
    if (translationDragRef.current) {
      translationDragRef.current.active = false;
    }
  }, []);

  useEffect(() => {
    window.addEventListener(
      "pointermove",
      handleTranslationPointerMove
    );

    window.addEventListener(
      "pointerup",
      handleTranslationPointerUp
    );

    return () => {
      window.removeEventListener(
        "pointermove",
        handleTranslationPointerMove
      );

      window.removeEventListener(
        "pointerup",
        handleTranslationPointerUp
      );
    };
  }, [
    handleTranslationPointerMove,
    handleTranslationPointerUp,
  ]);

  useEffect(() => {
    const handleKeyboard = (event) => {
      const tag = document.activeElement?.tagName;

      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT"
      ) {
        return;
      }

      if (event.code === "Space") {
        event.preventDefault();
        togglePlay();
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goToNextCard();
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        goToPreviousCard();
      }

      if (event.key === "j") seekBy(-10);
      if (event.key === "l") seekBy(10);
      if (event.key === "m") toggleMute();
      if (event.key === "f") toggleFullscreen();

      if (event.key === "[") {
        setPlaybackRate((old) => {
          const index = SPEEDS.indexOf(old);
          return SPEEDS[Math.max(0, index - 1)];
        });
      }

      if (event.key === "]") {
        setPlaybackRate((old) => {
          const index = SPEEDS.indexOf(old);
          return SPEEDS[
            Math.min(SPEEDS.length - 1, index + 1)
          ];
        });
      }

      showControlsTemporarily();
    };

    window.addEventListener("keydown", handleKeyboard);

    return () => {
      window.removeEventListener("keydown", handleKeyboard);
    };
  }, [
    goToNextCard,
    goToPreviousCard,
    seekBy,
    showControlsTemporarily,
    toggleFullscreen,
    toggleMute,
    togglePlay,
  ]);

  return (
    <div dir="rtl" className="movie-pluss">
      <style>{`
        * {
          box-sizing: border-box;
        }

        body {
          margin: 0;
          background: ${COLORS.bg};
        }

        button,
        input,
        textarea,
        select {
          font-family: inherit;
        }

        input[type="range"] {
          appearance: none;
          width: 100%;
          height: 5px;
          background: transparent;
          cursor: pointer;
        }

        input[type="range"]::-webkit-slider-runnable-track {
          height: 4px;
          border-radius: 8px;
          background: ${COLORS.border};
        }

        input[type="range"]::-webkit-slider-thumb {
          appearance: none;
          width: 14px;
          height: 14px;
          margin-top: -5px;
          border-radius: 50%;
          background: ${COLORS.yellow};
        }

        .movie-player:fullscreen {
          width: 100vw;
          height: 100vh;
          border: none !important;
          border-radius: 0 !important;
          background: #000;
        }

        .movie-player:fullscreen video {
          width: 100%;
          height: 100%;
          max-height: 100vh;
        }

        .player-controls {
          transition: opacity .2s ease;
        }

        .player-controls.hidden {
          opacity: 0;
          pointer-events: none;
        }

        .subtitle-card:hover {
          border-color: ${COLORS.yellow} !important;
        }

        .translation-popup {
          position: absolute;
          z-index: 100;
          width: min(310px, calc(100% - 32px));
          user-select: none;
          touch-action: none;
        }

        .translation-handle {
          cursor: grab;
          touch-action: none;
        }

        .translation-handle:active {
          cursor: grabbing;
        }
      `}</style>

      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 20px",
          borderBottom: `1px solid ${COLORS.border}`,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <Film size={28} color={COLORS.yellow} />

          <div>
            <div
              style={{
                fontSize: 23,
                fontWeight: 900,
              }}
            >
              فیلم پلاس
            </div>

            <div
              style={{
                color: COLORS.muted,
                fontSize: 11,
              }}
            >
              پلیر حرفه‌ای تمرین زبان با فیلم
            </div>
          </div>
        </div>

        <button
          onClick={() => setFilesOpen((value) => !value)}
          style={buttonStyle()}
        >
          فایل‌ها
          {filesOpen ? (
            <ChevronUp size={16} />
          ) : (
            <ChevronDown size={16} />
          )}
        </button>
      </header>

      {filesOpen && (
        <section
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(230px, 1fr))",
            gap: 14,
            padding: 20,
            background: COLORS.panel,
            borderBottom: `1px solid ${COLORS.border}`,
          }}
        >
          <label style={uploadBoxStyle()}>
            <Film size={18} color={COLORS.yellow} />
            {videoName || "انتخاب فایل ویدیو"}

            <input
              type="file"
              accept="video/*"
              onChange={(event) =>
                handleVideoFile(event.target.files?.[0])
              }
              style={{ display: "none" }}
            />
          </label>

          <SubtitleInput
            title="زیرنویس انگلیسی"
            language="en"
            file={englishFile}
            text={englishText}
            encoding={englishEncoding}
            color={COLORS.yellow}
            onFile={handleSubtitleFile}
            onText={setEnglishText}
            onEncoding={changeSubtitleEncoding}
          />

          <SubtitleInput
            title="زیرنویس فارسی"
            language="fa"
            file={persianFile}
            text={persianText}
            encoding={persianEncoding}
            color={COLORS.teal}
            onFile={handleSubtitleFile}
            onText={setPersianText}
            onEncoding={changeSubtitleEncoding}
          />

          <button
            onClick={applySubtitles}
            style={{
              alignSelf: "end",
              minHeight: 42,
              border: "none",
              borderRadius: 8,
              background: COLORS.yellow,
              color: "#171717",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            اعمال زیرنویس‌ها
          </button>
        </section>
      )}

      <main
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: 20,
        }}
      >
        <div
          ref={playerRef}
          className="movie-player"
          onMouseMove={showControlsTemporarily}
          style={{
            position: "relative",
            overflow: "hidden",
            minHeight: videoUrl ? 360 : 270,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 14,
            background: "#000",
          }}
        >
          {!videoUrl ? (
            <label
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                minHeight: 360,
                gap: 12,
                color: COLORS.muted,
                cursor: "pointer",
              }}
            >
              <CirclePlay size={50} color={COLORS.yellow} />
              برای انتخاب فیلم کلیک کنید

              <input
                type="file"
                accept="video/*"
                onChange={(event) =>
                  handleVideoFile(event.target.files?.[0])
                }
                style={{ display: "none" }}
              />
            </label>
          ) : (
            <>
              <video
                ref={videoRef}
                src={videoUrl}
                onLoadedMetadata={handleVideoLoaded}
                onTimeUpdate={handleTimeUpdate}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onDoubleClick={toggleFullscreen}
                onClick={togglePlay}
                style={{
                  display: "block",
                  width: "100%",
                  minHeight: 360,
                  maxHeight: "70vh",
                  background: "#000",
                  objectFit: "contain",
                  filter: `
                    brightness(${brightness}%)
                    contrast(${contrast}%)
                  `,
                }}
              />

              {wordPopup && (
                <div
                  ref={translationRef}
                  className="translation-popup"
                  style={{
                    top: translationPosition.top,
                    ...(translationPosition.left !== null
                      ? { left: translationPosition.left }
                      : { right: translationPosition.right }),
                  }}
                >
                  <div
                    style={{
                      overflow: "hidden",
                      border: `1px solid ${COLORS.teal}`,
                      borderRadius: 10,
                      background: "rgba(12,14,20,.97)",
                      boxShadow:
                        "0 10px 35px rgba(0,0,0,.5)",
                    }}
                  >
                    <div
                      className="translation-handle"
                      onPointerDown={
                        handleTranslationPointerDown
                      }
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "8px 11px",
                        background: COLORS.active,
                        color: COLORS.muted,
                        fontSize: 11,
                      }}
                    >
                      <span>برای جابه‌جایی بکشید</span>

                      <button
                        onPointerDown={(event) =>
                          event.stopPropagation()
                        }
                        onClick={() => setWordPopup(null)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: 26,
                          height: 26,
                          border: "none",
                          borderRadius: 6,
                          background: "transparent",
                          color: COLORS.muted,
                          cursor: "pointer",
                        }}
                      >
                        <X size={15} />
                      </button>
                    </div>

                    <div
                      style={{
                        padding: 13,
                        direction: "rtl",
                      }}
                    >
                      <div
                        style={{
                          color: COLORS.yellow,
                          direction: "ltr",
                          textAlign: "left",
                          fontWeight: 900,
                        }}
                      >
                        {wordPopup.word}
                      </div>

                      <div
                        style={{
                          marginTop: 6,
                          color: COLORS.teal,
                          lineHeight: 1.8,
                        }}
                      >
                        {wordPopup.loading
                          ? "در حال دریافت ترجمه..."
                          : wordPopup.translation}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeCue && (
                <div
                  style={{
                    position: "absolute",
                    right: 0,
                    bottom: subtitleBottom,
                    left: 0,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 5,
                    padding: "0 18px",
                    pointerEvents: "none",
                  }}
                >
                  {showEnglish && activeCue.en && (
                    <div
                      style={{
                        maxWidth: "92%",
                        padding: subtitleBackground
                          ? "5px 12px"
                          : "2px 4px",
                        borderRadius: 6,
                        background: subtitleBackground
                          ? "rgba(0,0,0,.78)"
                          : "transparent",
                        color: COLORS.yellow,
                        fontSize: `${17 *
                          (subtitleSize / 100)}px`,
                        fontWeight: 700,
                        textAlign: "center",
                        direction: "ltr",
                        pointerEvents: "auto",
                      }}
                    >
                      {renderEnglish(activeCue.en, "overlay")}
                    </div>
                  )}

                  {showPersian && activeCue.fa && (
                    <div
                      style={{
                        maxWidth: "92%",
                        padding: subtitleBackground
                          ? "5px 12px"
                          : "2px 4px",
                        borderRadius: 6,
                        background: subtitleBackground
                          ? "rgba(0,0,0,.78)"
                          : "transparent",
                        color: COLORS.teal,
                        fontSize: `${17 *
                          (subtitleSize / 100)}px`,
                        fontWeight: 700,
                        textAlign: "center",
                      }}
                    >
                      {activeCue.fa}
                    </div>
                  )}
                </div>
              )}

              <div
                className={`player-controls ${
                  controlsVisible ? "" : "hidden"
                }`}
                style={{
                  position: "absolute",
                  right: 0,
                  bottom: 0,
                  left: 0,
                  padding: "45px 14px 12px",
                  background:
                    "linear-gradient(transparent, rgba(0,0,0,.9))",
                }}
                onClick={(event) =>
                  event.stopPropagation()
                }
              >
                <input
                  type="range"
                  min="0"
                  max={duration || 0}
                  step="0.01"
                  value={currentTime}
                  onChange={(event) =>
                    seekTo(event.target.value)
                  }
                  style={{
                    direction: "ltr",
                    accentColor: COLORS.yellow,
                  }}
                />

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginTop: 8,
                    direction: "ltr",
                  }}
                >
                  <ControlButton onClick={togglePlay}>
                    {isPlaying ? (
                      <Pause size={20} />
                    ) : (
                      <Play size={20} />
                    )}
                  </ControlButton>

                  <ControlButton onClick={() => seekBy(-10)}>
                    <RotateCcw size={18} />
                  </ControlButton>

                  <ControlButton onClick={() => seekBy(10)}>
                    <RotateCw size={18} />
                  </ControlButton>

                  <ControlButton onClick={toggleMute}>
                    {isMuted || volume === 0 ? (
                      <VolumeX size={18} />
                    ) : volume < 0.5 ? (
                      <Volume1 size={18} />
                    ) : (
                      <Volume2 size={18} />
                    )}
                  </ControlButton>

                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={isMuted ? 0 : volume}
                    onChange={(event) =>
                      changeVolume(event.target.value)
                    }
                    style={{
                      width: 90,
                      accentColor: COLORS.yellow,
                    }}
                  />

                  <span
                    style={{
                      minWidth: 108,
                      color: COLORS.text,
                      fontSize: 11,
                      direction: "ltr",
                    }}
                  >
                    {formatTime(currentTime)} /{" "}
                    {formatTime(duration)}
                  </span>

                  <div style={{ flex: 1 }} />

                  <select
                    value={playbackRate}
                    onChange={(event) =>
                      setPlaybackRate(
                        Number(event.target.value)
                      )
                    }
                    style={selectStyle()}
                    title="سرعت پخش"
                  >
                    {SPEEDS.map((speed) => (
                      <option
                        key={speed}
                        value={speed}
                        style={{
                          background: COLORS.card,
                        }}
                      >
                        {speed}x
                      </option>
                    ))}
                  </select>

                  {/* تکرار جمله کنار کنترل سرعت */}
                  <button
                    onClick={() =>
                      setRepeatOn((value) => !value)
                    }
                    title="فعال یا غیرفعال کردن تکرار جمله"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      height: 32,
                      padding: "0 10px",
                      border: `1px solid ${
                        repeatOn
                          ? COLORS.yellow
                          : COLORS.border
                      }`,
                      borderRadius: 7,
                      background: repeatOn
                        ? "rgba(242,201,76,.18)"
                        : "rgba(0,0,0,.3)",
                      color: repeatOn
                        ? COLORS.yellow
                        : COLORS.text,
                      fontSize: 11,
                      cursor: "pointer",
                    }}
                  >
                    <RotateCw size={15} />
                    تکرار
                  </button>

                  <ControlButton
                    active={showEnglish}
                    onClick={() =>
                      setShowEnglish((value) => !value)
                    }
                  >
                    <Subtitles size={18} />
                  </ControlButton>

                  <ControlButton
                    active={settingsOpen}
                    onClick={() =>
                      setSettingsOpen((value) => !value)
                    }
                  >
                    <Settings size={18} />
                  </ControlButton>

                  <ControlButton onClick={toggleFullscreen}>
                    {isFullscreen ? (
                      <Minimize size={18} />
                    ) : (
                      <Maximize size={18} />
                    )}
                  </ControlButton>
                </div>
              </div>

              {settingsOpen && (
                <div
                  style={{
                    position: "absolute",
                    top: 14,
                    left: 14,
                    zIndex: 90,
                    width: 260,
                    padding: 14,
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: 10,
                    background: "rgba(20,23,31,.97)",
                  }}
                  onClick={(event) =>
                    event.stopPropagation()
                  }
                >
                  <SettingRange
                    label="روشنایی"
                    value={brightness}
                    min={50}
                    max={150}
                    onChange={setBrightness}
                  />

                  <SettingRange
                    label="کنتراست"
                    value={contrast}
                    min={50}
                    max={150}
                    onChange={setContrast}
                  />

                  <SettingRange
                    label="اندازه زیرنویس"
                    value={subtitleSize}
                    min={60}
                    max={180}
                    onChange={setSubtitleSize}
                  />

                  <SettingRange
                    label="موقعیت زیرنویس"
                    value={subtitleBottom}
                    min={5}
                    max={180}
                    onChange={setSubtitleBottom}
                  />

                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginTop: 10,
                      color: COLORS.text,
                      fontSize: 12,
                    }}
                  >
                    پس‌زمینه زیرنویس
                    <input
                      type="checkbox"
                      checked={subtitleBackground}
                      onChange={(event) =>
                        setSubtitleBackground(
                          event.target.checked
                        )
                      }
                    />
                  </label>
                </div>
              )}
            </>
          )}
        </div>

        {videoUrl && (
          <>
            {/*
              تمام دکمه‌های مربوط به کارت‌ها و زیرنویس‌ها
              به زیر کادر فیلم منتقل شده‌اند.
              
              ترتیب از راست به چپ:
              قبلی، تکرار، پخش، بعدی، ترجمه انگلیسی، ترجمه فارسی
            */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 9,
                flexWrap: "wrap",
                marginTop: 16,
                direction: "rtl",
              }}
            >
              {/* سمت راست: کارت قبلی */}
              <RoundButton
                title="کارت قبلی"
                onClick={goToPreviousCard}
              >
                <ChevronRight size={20} />
              </RoundButton>

              <button
                onClick={replayCurrentCard}
                title="شروع مجدد کارت"
                style={pillButtonStyle()}
              >
                <RotateCcw size={16} />
                شروع مجدد
              </button>

              <button
                onClick={() =>
                  setRepeatOn((value) => !value)
                }
                title="فعال یا غیرفعال کردن تکرار جمله"
                style={{
                  ...pillButtonStyle(),
                  color: repeatOn
                    ? COLORS.yellow
                    : COLORS.muted,
                  borderColor: repeatOn
                    ? COLORS.yellow
                    : COLORS.border,
                }}
              >
                <RotateCw size={16} />
                تکرار جمله
              </button>

              <RoundButton
                title="پخش / توقف"
                large
                onClick={togglePlay}
              >
                {isPlaying ? (
                  <CirclePause size={28} />
                ) : (
                  <CirclePlay size={28} />
                )}
              </RoundButton>

              {/* سمت چپ: کارت بعدی */}
              <RoundButton
                title="کارت بعدی"
                onClick={goToNextCard}
              >
                <ChevronLeft size={20} />
              </RoundButton>

              {/* ترجمه انگلیسی و فارسی کنار هم */}
              <button
                onClick={() =>
                  setShowEnglish((value) => !value)
                }
                style={{
                  ...pillButtonStyle(),
                  color: showEnglish
                    ? COLORS.yellow
                    : COLORS.muted,
                  borderColor: showEnglish
                    ? COLORS.yellow
                    : COLORS.border,
                }}
              >
                <Subtitles size={16} />
                ترجمه انگلیسی
              </button>

              <button
                onClick={() =>
                  setShowPersian((value) => !value)
                }
                style={{
                  ...pillButtonStyle(),
                  color: showPersian
                    ? COLORS.teal
                    : COLORS.muted,
                  borderColor: showPersian
                    ? COLORS.teal
                    : COLORS.border,
                }}
              >
                <Subtitles size={16} />
                ترجمه فارسی
              </button>
            </div>

            {cues.length > 0 && (
              <section style={{ marginTop: 25 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 9,
                    color: COLORS.muted,
                    fontSize: 12,
                  }}
                >
                  <span>کارت‌ها ({cues.length})</span>
                  <span>
                    کارت{" "}
                    {currentCue >= 0 ? currentCue + 1 : "-"}
                  </span>
                </div>

                {/*
                  مهم:
                  direction: ltr باعث می‌شود کارت‌ها از سمت چپ
                  شروع شوند و کارت اول در سمت چپ قرار بگیرد.
                */}
                <div
                  ref={cardsRef}
                  style={{
                    display: "flex",
                    flexDirection: "row",
                    gap: 10,
                    overflowX: "auto",
                    paddingBottom: 10,
                    direction: "ltr",
                  }}
                >
                  {cues.map((cue, index) => (
                    <div
                      key={index}
                      data-card={index}
                      className="subtitle-card"
                      onClick={() =>
                        jumpToCue(index, true)
                      }
                      style={{
                        minWidth: 230,
                        maxWidth: 230,
                        flexShrink: 0,
                        padding: 11,
                        border: `1px solid ${
                          currentCue === index
                            ? COLORS.yellow
                            : COLORS.border
                        }`,
                        borderRadius: 10,
                        background:
                          currentCue === index
                            ? COLORS.active
                            : COLORS.card,
                        cursor: "pointer",
                        direction: "rtl",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginBottom: 8,
                          color: COLORS.muted,
                          fontSize: 10,
                        }}
                      >
                        <span>کارت {index + 1}</span>
                        <span>{formatTime(cue.start)}</span>
                      </div>

                      {cue.en && (
                        <div
                          style={{
                            color: COLORS.yellow,
                            fontSize: 12,
                            lineHeight: 1.6,
                            direction: "ltr",
                            textAlign: "left",
                          }}
                        >
                          {renderEnglish(
                            cue.en,
                            `card-${index}`
                          )}
                        </div>
                      )}

                      {cue.fa && (
                        <div
                          style={{
                            marginTop: 5,
                            color: COLORS.teal,
                            fontSize: 12,
                            lineHeight: 1.7,
                            textAlign: "right",
                          }}
                        >
                          {cue.fa}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function SubtitleInput({
  title,
  language,
  file,
  text,
  encoding,
  color,
  onFile,
  onText,
  onEncoding,
}) {
  return (
    <div>
      <div
        style={{
          marginBottom: 6,
          color: COLORS.muted,
          fontSize: 12,
        }}
      >
        {title}
      </div>

      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          marginBottom: 6,
          padding: "8px 10px",
          border: `1px dashed ${COLORS.border}`,
          borderRadius: 8,
          background: COLORS.card,
          color: COLORS.text,
          fontSize: 11,
          cursor: "pointer",
        }}
      >
        <Subtitles size={15} color={color} />
        {file?.name || "انتخاب فایل زیرنویس"}

        <input
          type="file"
          accept=".srt,.vtt,.txt"
          onChange={(event) =>
            onFile(event.target.files?.[0], language)
          }
          style={{ display: "none" }}
        />
      </label>

      <select
        value={encoding}
        onChange={(event) =>
          onEncoding(language, event.target.value)
        }
        style={selectStyle(true)}
      >
        {ENCODINGS.map((item) => (
          <option
            key={item.value}
            value={item.value}
            style={{ background: COLORS.card }}
          >
            {item.label}
          </option>
        ))}
      </select>

      <textarea
        value={text}
        onChange={(event) => onText(event.target.value)}
        placeholder="متن زیرنویس را وارد کنید..."
        dir={language === "fa" ? "rtl" : "ltr"}
        style={{
          width: "100%",
          height: 65,
          resize: "vertical",
          padding: 8,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 8,
          outline: "none",
          background: COLORS.card,
          color: COLORS.text,
          fontSize: 11,
        }}
      />
    </div>
  );
}

function SettingRange({
  label,
  value,
  min,
  max,
  onChange,
}) {
  return (
    <label
      style={{
        display: "block",
        marginBottom: 12,
        color: COLORS.text,
        fontSize: 11,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 5,
        }}
      >
        <span>{label}</span>
        <span style={{ color: COLORS.muted }}>{value}</span>
      </div>

      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) =>
          onChange(Number(event.target.value))
        }
      />
    </label>
  );
}

function ControlButton({
  children,
  onClick,
  active = false,
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 34,
        height: 32,
        padding: 0,
        border: `1px solid ${
          active ? COLORS.yellow : "transparent"
        }`,
        borderRadius: 7,
        background: active
          ? "rgba(242,201,76,.18)"
          : "rgba(0,0,0,.3)",
        color: active ? COLORS.yellow : COLORS.text,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function RoundButton({
  children,
  onClick,
  title,
  large = false,
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: large ? 56 : 43,
        height: large ? 56 : 43,
        padding: 0,
        border: `1px solid ${COLORS.border}`,
        borderRadius: "50%",
        background: COLORS.card,
        color: COLORS.text,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function buttonStyle() {
  return {
    display: "flex",
    alignItems: "center",
    gap: 7,
    padding: "8px 12px",
    border: `1px solid ${COLORS.border}`,
    borderRadius: 8,
    background: COLORS.card,
    color: COLORS.text,
    cursor: "pointer",
  };
}

function uploadBoxStyle() {
  return {
    display: "flex",
    alignItems: "center",
    gap: 8,
    minHeight: 42,
    padding: "8px 12px",
    border: `1px dashed ${COLORS.border}`,
    borderRadius: 8,
    background: COLORS.card,
    color: COLORS.text,
    fontSize: 12,
    cursor: "pointer",
  };
}

function selectStyle(full = false) {
  return {
    width: full ? "100%" : "auto",
    minHeight: 32,
    padding: "3px 7px",
    border: `1px solid ${COLORS.border}`,
    borderRadius: 6,
    outline: "none",
    background: COLORS.card,
    color: COLORS.text,
    fontSize: 11,
    cursor: "pointer",
  };
}

function pillButtonStyle() {
  return {
    display: "flex",
    alignItems: "center",
    gap: 7,
    minHeight: 42,
    padding: "0 13px",
    border: `1px solid ${COLORS.border}`,
    borderRadius: 22,
    background: COLORS.card,
    color: COLORS.text,
    fontSize: 12,
    cursor: "pointer",
  };
}
