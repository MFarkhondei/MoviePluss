import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  ChevronLeft,
  ChevronRight,
  CirclePause,
  CirclePlay,
  Maximize,
  Minimize,
  RotateCcw,
  RotateCw,
  Settings,
  Subtitles,
  Volume1,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";

import "vazirmatn/Vazirmatn-font-face.css";

const COLORS = {
  bg: "#0B0D12",
  panel: "#151922",
  card: "#1C212C",
  border: "#343B4B",
  text: "#F4F4F1",
  muted: "#A3A9B7",
  yellow: "#FFD54A",
  teal: "#4CE0C1",
  mxControl: "rgba(16, 19, 26, 0.62)",
  mxHover: "rgba(255, 255, 255, 0.14)",
};

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

function timeToSeconds(value = "") {
  const values = value
    .trim()
    .replace(",", ".")
    .split(":")
    .map(Number);

  if (values.length === 3) {
    return values[0] * 3600 + values[1] * 60 + values[2];
  }

  if (values.length === 2) {
    return values[0] * 60 + values[1];
  }

  return values[0] || 0;
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

function parseSubtitleText(text = "") {
  if (!text.trim()) return [];

  return text
    .replace(/\r/g, "")
    .replace(/^WEBVTT.*\n+/i, "")
    .split(/\n\s*\n/g)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split("\n");
      const timeLineIndex = lines.findIndex((line) =>
        line.includes("-->")
      );

      if (timeLineIndex === -1) return null;

      const [startRaw, endRaw] =
        lines[timeLineIndex].split("-->");

      const start = timeToSeconds(startRaw);
      const end = timeToSeconds(
        endRaw?.trim().split(/\s+/)[0] || ""
      );

      const subtitle = lines
        .slice(timeLineIndex + 1)
        .join(" ")
        .replace(/<[^>]*>/g, "")
        .trim();

      if (!subtitle) return null;

      return {
        start,
        end,
        text: subtitle,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start);
}

function mergeSubtitles(englishText, persianText) {
  const english = parseSubtitleText(englishText);
  const persian = parseSubtitleText(persianText);
  const count = Math.max(english.length, persian.length);

  return Array.from({ length: count }, (_, index) => {
    const en = english[index];
    const fa = persian[index];
    const timing = en || fa;

    return {
      id: index,
      start: timing?.start || 0,
      end: timing?.end || 0,
      en: en?.text || "",
      fa: fa?.text || "",
    };
  });
}

async function readFileAsText(file) {
  const buffer = await file.arrayBuffer();

  try {
    const utf8Text = new TextDecoder("utf-8").decode(buffer);

    const invalidCharacters =
      utf8Text.match(/\uFFFD/g)?.length || 0;

    if (invalidCharacters > 2) {
      return new TextDecoder("windows-1256").decode(buffer);
    }

    return utf8Text;
  } catch {
    return new TextDecoder("windows-1256").decode(buffer);
  }
}

function cleanWord(word = "") {
  return word
    .replace(/[.,!?;:()[\]{}"“”'’`*_+=/\\|<>]/g, "")
    .trim();
}

/*
  هر کلمه‌ی انگلیسی جداگانه قابل کلیک است.
  با کلیک، ترجمه از سرویس MyMemory دریافت می‌شود.
*/
async function translateEnglishWord(word) {
  const clean = cleanWord(word);

  if (!clean) return "";

  const response = await fetch(
    `https://api.mymemory.translated.net/get?q=${encodeURIComponent(
      clean
    )}&langpair=en|fa`
  );

  if (!response.ok) {
    throw new Error("خطا در دریافت ترجمه");
  }

  const data = await response.json();

  return (
    data?.responseData?.translatedText ||
    "ترجمه‌ای پیدا نشد"
  );
}

export default function MoviePluss() {
  const videoRef = useRef(null);
  const playerRef = useRef(null);
  const controlTimerRef = useRef(null);
  const cuesRef = useRef([]);
  const currentCueRef = useRef(-1);
  const repeatRef = useRef(false);

  const [videoUrl, setVideoUrl] = useState("");
  const [videoName, setVideoName] = useState("");

  const [englishSubtitle, setEnglishSubtitle] = useState("");
  const [persianSubtitle, setPersianSubtitle] = useState("");

  const [cues, setCues] = useState([]);
  const [currentCue, setCurrentCue] = useState(-1);

  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [repeatSentence, setRepeatSentence] =
    useState(false);

  const [showEnglish, setShowEnglish] = useState(true);
  const [showPersian, setShowPersian] = useState(true);

  const [controlsVisible, setControlsVisible] =
    useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [settingsVisible, setSettingsVisible] =
    useState(false);

  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [subtitleSize, setSubtitleSize] = useState(100);

  const [wordPopup, setWordPopup] = useState({
    visible: false,
    word: "",
    translation: "",
    loading: false,
    x: 20,
    y: 20,
  });

  const popupDragRef = useRef({
    dragging: false,
    offsetX: 0,
    offsetY: 0,
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
    repeatRef.current = repeatSentence;
  }, [repeatSentence]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
  }, [speed]);

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      clearTimeout(controlTimerRef.current);
    };
  }, [videoUrl]);

  useEffect(() => {
    const fullscreenChange = () => {
      setIsFullscreen(
        document.fullscreenElement === playerRef.current
      );
    };

    document.addEventListener(
      "fullscreenchange",
      fullscreenChange
    );

    return () => {
      document.removeEventListener(
        "fullscreenchange",
        fullscreenChange
      );
    };
  }, []);

  const showControls = useCallback(() => {
    setControlsVisible(true);

    clearTimeout(controlTimerRef.current);

    if (isPlaying) {
      controlTimerRef.current = setTimeout(() => {
        setControlsVisible(false);
      }, 2800);
    }
  }, [isPlaying]);

  useEffect(() => {
    showControls();
  }, [isPlaying, showControls]);

  const playVideo = useCallback(async () => {
    if (!videoRef.current) return;

    try {
      await videoRef.current.play();
      setIsPlaying(true);
      showControls();
    } catch (error) {
      console.error("Video play error:", error);
    }
  }, [showControls]);

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
  }, [pauseVideo, playVideo]);

  const selectCard = useCallback(
    (index, autoplay = true) => {
      const cue = cuesRef.current[index];

      if (!cue || !videoRef.current) return;

      currentCueRef.current = index;
      setCurrentCue(index);

      videoRef.current.currentTime = cue.start;
      setCurrentTime(cue.start);

      if (autoplay) {
        playVideo();
      }
    },
    [playVideo]
  );

  /*
    دکمه و کلید سمت راست = کارت بعدی
  */
  const nextCard = useCallback(() => {
    const nextIndex = currentCueRef.current + 1;

    if (nextIndex < cuesRef.current.length) {
      selectCard(nextIndex, true);
    }
  }, [selectCard]);

  /*
    دکمه و کلید سمت چپ = کارت قبلی
  */
  const previousCard = useCallback(() => {
    const previousIndex = currentCueRef.current - 1;

    if (previousIndex >= 0) {
      selectCard(previousIndex, true);
    }
  }, [selectCard]);

  const seekBy = useCallback(
    (seconds) => {
      if (!videoRef.current) return;

      const target = Math.max(
        0,
        Math.min(
          videoRef.current.duration || 0,
          videoRef.current.currentTime + seconds
        )
      );

      videoRef.current.currentTime = target;
      setCurrentTime(target);
      showControls();
    },
    [showControls]
  );

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;

    const time = videoRef.current.currentTime;
    const list = cuesRef.current;
    const activeIndex = currentCueRef.current;

    setCurrentTime(time);

    /*
      حالت تکرار:
      پخش از ابتدای کارت فعلی تا ابتدای کارت بعدی،
      سپس بازگشت دوباره به ابتدای کارت فعلی.
    */
    if (
      repeatRef.current &&
      activeIndex >= 0 &&
      list[activeIndex]
    ) {
      const cue = list[activeIndex];
      const nextCue = list[activeIndex + 1];
      const stopAt = nextCue ? nextCue.start : cue.end;

      if (time >= stopAt - 0.04) {
        videoRef.current.currentTime = cue.start;
        return;
      }
    }

    const detectedCue = list.findIndex(
      (cue) => time >= cue.start && time < cue.end
    );

    if (
      detectedCue !== -1 &&
      detectedCue !== currentCueRef.current
    ) {
      currentCueRef.current = detectedCue;
      setCurrentCue(detectedCue);
    }
  };

  const handleVideoSelect = (file) => {
    if (!file) return;

    if (videoUrl) URL.revokeObjectURL(videoUrl);

    const url = URL.createObjectURL(file);

    setVideoUrl(url);
    setVideoName(file.name);
    setCurrentTime(0);
    setDuration(0);
    setCurrentCue(-1);

    currentCueRef.current = -1;
  };

  const handleSubtitleSelect = async (file, type) => {
    if (!file) return;

    const text = await readFileAsText(file);

    if (type === "en") {
      setEnglishSubtitle(text);
    } else {
      setPersianSubtitle(text);
    }
  };

  const applySubtitles = () => {
    const merged = mergeSubtitles(
      englishSubtitle,
      persianSubtitle
    );

    setCues(merged);
    cuesRef.current = merged;
    setCurrentCue(-1);
    currentCueRef.current = -1;
  };

  const toggleMute = () => {
    if (!videoRef.current) return;

    const nextMuted = !isMuted;

    videoRef.current.muted = nextMuted;
    setIsMuted(nextMuted);

    if (!nextMuted && volume === 0) {
      videoRef.current.volume = 1;
      setVolume(1);
    }
  };

  const changeVolume = (value) => {
    const newVolume = Number(value);

    setVolume(newVolume);
    setIsMuted(newVolume === 0);

    if (videoRef.current) {
      videoRef.current.volume = newVolume;
      videoRef.current.muted = newVolume === 0;
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

  const handleWordClick = async (rawWord) => {
    const word = cleanWord(rawWord);

    if (!word) return;

    setWordPopup((old) => ({
      ...old,
      visible: true,
      word,
      translation: "",
      loading: true,
    }));

    try {
      const translation = await translateEnglishWord(word);

      setWordPopup((old) => ({
        ...old,
        visible: true,
        word,
        translation,
        loading: false,
      }));
    } catch {
      setWordPopup((old) => ({
        ...old,
        visible: true,
        word,
        translation: "خطا در دریافت ترجمه. دوباره تلاش کنید.",
        loading: false,
      }));
    }
  };

  const startPopupDrag = (event) => {
    popupDragRef.current = {
      dragging: true,
      offsetX: event.clientX - wordPopup.x,
      offsetY: event.clientY - wordPopup.y,
    };
  };

  useEffect(() => {
    const movePopup = (event) => {
      if (!popupDragRef.current.dragging) return;

      const parent = playerRef.current;
      if (!parent) return;

      const rect = parent.getBoundingClientRect();
      const popupWidth = 250;
      const popupHeight = 110;

      const x = Math.max(
        5,
        Math.min(
          rect.width - popupWidth - 5,
          event.clientX -
            rect.left -
            popupDragRef.current.offsetX
        )
      );

      const y = Math.max(
        5,
        Math.min(
          rect.height - popupHeight - 5,
          event.clientY -
            rect.top -
            popupDragRef.current.offsetY
        )
      );

      setWordPopup((old) => ({
        ...old,
        x,
        y,
      }));
    };

    const stopPopupDrag = () => {
      popupDragRef.current.dragging = false;
    };

    window.addEventListener("mousemove", movePopup);
    window.addEventListener("mouseup", stopPopupDrag);

    return () => {
      window.removeEventListener("mousemove", movePopup);
      window.removeEventListener("mouseup", stopPopupDrag);
    };
  }, []);

  useEffect(() => {
    const keyboardHandler = (event) => {
      const tagName = document.activeElement?.tagName;

      if (
        tagName === "INPUT" ||
        tagName === "TEXTAREA" ||
        tagName === "SELECT"
      ) {
        return;
      }

      if (event.code === "Space") {
        event.preventDefault();
        togglePlay();
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        nextCard();
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        previousCard();
      }

      if (event.key.toLowerCase() === "j") seekBy(-10);
      if (event.key.toLowerCase() === "l") seekBy(10);
      if (event.key.toLowerCase() === "m") toggleMute();
      if (event.key.toLowerCase() === "f") toggleFullscreen();

      showControls();
    };

    window.addEventListener("keydown", keyboardHandler);

    return () =>
      window.removeEventListener("keydown", keyboardHandler);
  }, [
    nextCard,
    previousCard,
    seekBy,
    showControls,
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
          font-family: Vazirmatn, sans-serif;
        }

        input[type="range"] {
          appearance: none;
          height: 4px;
          border-radius: 10px;
          cursor: pointer;
          accent-color: ${COLORS.yellow};
        }

        input[type="range"]::-webkit-slider-runnable-track {
          height: 4px;
          border-radius: 10px;
          background: rgba(255,255,255,.24);
        }

        input[type="range"]::-webkit-slider-thumb {
          appearance: none;
          width: 12px;
          height: 12px;
          margin-top: -4px;
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
          max-height: 100vh !important;
        }

        /*
          کنترل‌ها مانند MX Player:
          کم‌رنگ، جمع‌وجور، زیر نمایشگر،
          و با شروع پخش به‌صورت خودکار مخفی می‌شوند.
        */
        .mx-controls {
          display: flex;
          align-items: center;
          width: 100%;
          gap: 5px;
          min-height: 54px;
          margin-top: 9px;
          padding: 7px 9px;
          overflow-x: auto;
          overflow-y: hidden;
          border: 1px solid rgba(255,255,255,.10);
          border-radius: 11px;
          background: ${COLORS.mxControl};
          backdrop-filter: blur(10px);
          transition:
            opacity .28s ease,
            transform .28s ease,
            max-height .28s ease,
            padding .28s ease,
            margin .28s ease;
        }

        .mx-controls.hidden {
          max-height: 0;
          min-height: 0;
          margin-top: 0;
          padding-top: 0;
          padding-bottom: 0;
          overflow: hidden;
          opacity: 0;
          transform: translateY(-7px);
          pointer-events: none;
          border-color: transparent;
        }

        .mx-controls > * {
          flex: 0 0 auto;
        }

        .mx-divider {
          width: 1px;
          height: 23px;
          margin: 0 3px;
          background: rgba(255,255,255,.16);
        }

        .english-word {
          display: inline-block;
          margin: 0 2px;
          border-radius: 4px;
          cursor: pointer;
          transition: color .15s ease, background .15s ease;
        }

        .english-word:hover {
          color: ${COLORS.yellow} !important;
          background: rgba(255,213,74,.16);
        }

        .subtitle-card:hover {
          border-color: rgba(255,213,74,.8) !important;
        }

        @media (max-width: 700px) {
          .time-text {
            display: none;
          }

          .volume-slider {
            width: 50px !important;
          }

          .subtitle-card {
            min-width: 205px !important;
          }
        }
      `}</style>

      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 20px",
          borderBottom: `1px solid ${COLORS.border}`,
          background: COLORS.panel,
        }}
      >
        <div>
          <div
            style={{
              color: COLORS.text,
              fontSize: 22,
              fontWeight: 900,
            }}
          >
            فیلم پلاس
          </div>

          <div
            style={{
              marginTop: 2,
              color: COLORS.muted,
              fontSize: 11,
            }}
          >
            تمرین زبان با فیلم و زیرنویس
          </div>
        </div>
      </header>

      <section
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 13,
          padding: 18,
          borderBottom: `1px solid ${COLORS.border}`,
          background: "#10131B",
        }}
      >
        <FileInput
          label="فایل ویدیو"
          accept="video/*"
          onChange={(file) => handleVideoSelect(file)}
        />

        <FileInput
          label="زیرنویس انگلیسی"
          accept=".srt,.vtt,.txt"
          onChange={(file) =>
            handleSubtitleSelect(file, "en")
          }
        />

        <FileInput
          label="زیرنویس فارسی"
          accept=".srt,.vtt,.txt"
          onChange={(file) =>
            handleSubtitleSelect(file, "fa")
          }
        />

        <button
          onClick={applySubtitles}
          style={{
            minHeight: 42,
            alignSelf: "end",
            border: "none",
            borderRadius: 8,
            background: COLORS.yellow,
            color: "#171717",
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          اعمال زیرنویس‌ها
        </button>
      </section>

      <main
        style={{
          width: "100%",
          maxWidth: 1120,
          margin: "0 auto",
          padding: 20,
        }}
      >
        <div
          ref={playerRef}
          className="movie-player"
          onMouseMove={showControls}
          onClick={showControls}
          style={{
            position: "relative",
            overflow: "hidden",
            minHeight: 350,
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
                minHeight: 350,
                gap: 12,
                color: COLORS.muted,
                cursor: "pointer",
              }}
            >
              <CirclePlay size={54} color={COLORS.yellow} />
              <span>فایل ویدیو را انتخاب کنید</span>

              <input
                type="file"
                accept="video/*"
                onChange={(event) =>
                  handleVideoSelect(event.target.files?.[0])
                }
                style={{ display: "none" }}
              />
            </label>
          ) : (
            <>
              <video
                ref={videoRef}
                src={videoUrl}
                onLoadedMetadata={() => {
                  setDuration(videoRef.current?.duration || 0);
                }}
                onTimeUpdate={handleTimeUpdate}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onClick={(event) => {
                  event.stopPropagation();
                  togglePlay();
                }}
                onDoubleClick={toggleFullscreen}
                style={{
                  display: "block",
                  width: "100%",
                  minHeight: 350,
                  maxHeight: "72vh",
                  objectFit: "contain",
                  background: "#000",
                  filter: `brightness(${brightness}%) contrast(${contrast}%)`,
                }}
              />

              {activeCue && (
                <div
                  style={{
                    position: "absolute",
                    right: 10,
                    bottom: 18,
                    left: 10,
                    zIndex: 3,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 6,
                    pointerEvents: "auto",
                  }}
                >
                  {showEnglish && activeCue.en && (
                    <div
                      dir="ltr"
                      style={{
                        maxWidth: "94%",
                        padding: "5px 10px",
                        borderRadius: 7,
                        background: "rgba(0,0,0,.76)",
                        color: "#FFFFFF",
                        fontSize: `${17 * (subtitleSize / 100)}px`,
                        fontWeight: 700,
                        textAlign: "center",
                        lineHeight: 1.8,
                      }}
                    >
                      <ClickableEnglishText
                        text={activeCue.en}
                        onWordClick={handleWordClick}
                      />
                    </div>
                  )}

                  {showPersian && activeCue.fa && (
                    <div
                      style={{
                        maxWidth: "94%",
                        padding: "5px 10px",
                        borderRadius: 7,
                        background: "rgba(0,0,0,.76)",
                        color: COLORS.teal,
                        fontSize: `${17 * (subtitleSize / 100)}px`,
                        fontWeight: 700,
                        textAlign: "center",
                        lineHeight: 1.8,
                      }}
                    >
                      {activeCue.fa}
                    </div>
                  )}
                </div>
              )}

              {wordPopup.visible && (
                <div
                  style={{
                    position: "absolute",
                    zIndex: 10,
                    top: wordPopup.y,
                    left: wordPopup.x,
                    width: 250,
                    overflow: "hidden",
                    border: "1px solid rgba(255,213,74,.65)",
                    borderRadius: 10,
                    boxShadow: "0 8px 26px rgba(0,0,0,.5)",
                    background: "rgba(18, 22, 30, .96)",
                    color: COLORS.text,
                  }}
                >
                  <div
                    onMouseDown={startPopupDrag}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "7px 8px 7px 10px",
                      borderBottom:
                        "1px solid rgba(255,255,255,.12)",
                      background: "rgba(255,255,255,.05)",
                      cursor: "move",
                      userSelect: "none",
                    }}
                  >
                    <span
                      dir="ltr"
                      style={{
                        color: COLORS.yellow,
                        fontSize: 13,
                        fontWeight: 800,
                      }}
                    >
                      {wordPopup.word}
                    </span>

                    <button
                      onMouseDown={(event) =>
                        event.stopPropagation()
                      }
                      onClick={() =>
                        setWordPopup((old) => ({
                          ...old,
                          visible: false,
                        }))
                      }
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 24,
                        height: 24,
                        border: "none",
                        borderRadius: 5,
                        background: "transparent",
                        color: COLORS.muted,
                        cursor: "pointer",
                      }}
                    >
                      <X size={16} />
                    </button>
                  </div>

                  <div
                    style={{
                      minHeight: 49,
                      padding: "10px 12px",
                      color: COLORS.teal,
                      fontSize: 13,
                      lineHeight: 1.9,
                    }}
                  >
                    {wordPopup.loading
                      ? "در حال دریافت ترجمه..."
                      : wordPopup.translation}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {videoUrl && (
          <>
            {/*
              ترتیب بهتر دکمه‌ها از راست به چپ:

              1. کارت بعدی (فلش راست)
              2. پخش / توقف
              3. کارت قبلی (فلش چپ)
              4. ده ثانیه جلو و عقب
              5. تکرار جمله
              6. زیرنویس انگلیسی و فارسی
              7. صدا و میزان صدا
              8. سرعت، تنظیمات و تمام‌صفحه
            */}
            <div
              className={`mx-controls ${
                controlsVisible ? "" : "hidden"
              }`}
              onMouseMove={showControls}
              onMouseEnter={() => setControlsVisible(true)}
            >
              <MXButton
                title="کارت بعدی — کلید جهت راست"
                onClick={nextCard}
              >
                <ChevronRight size={22} />
              </MXButton>

              <MXButton
                title="پخش / توقف"
                primary
                onClick={togglePlay}
              >
                {isPlaying ? (
                  <CirclePause size={28} />
                ) : (
                  <CirclePlay size={28} />
                )}
              </MXButton>

              <MXButton
                title="کارت قبلی — کلید جهت چپ"
                onClick={previousCard}
              >
                <ChevronLeft size={22} />
              </MXButton>

              <div className="mx-divider" />

              <MXButton
                title="۱۰ ثانیه جلو"
                onClick={() => seekBy(10)}
              >
                <RotateCw size={18} />
              </MXButton>

              <MXButton
                title="۱۰ ثانیه عقب"
                onClick={() => seekBy(-10)}
              >
                <RotateCcw size={18} />
              </MXButton>

              <button
                title="تکرار جمله"
                onClick={() =>
                  setRepeatSentence((value) => !value)
                }
                style={smallControlStyle(repeatSentence)}
              >
                <RotateCw size={16} />
                <span className="control-label">تکرار</span>
              </button>

              <div className="mx-divider" />

              <button
                title="نمایش / عدم نمایش زیرنویس انگلیسی"
                onClick={() =>
                  setShowEnglish((value) => !value)
                }
                style={{
                  ...smallControlStyle(showEnglish),
                  color: showEnglish
                    ? COLORS.yellow
                    : "rgba(255,255,255,.47)",
                }}
              >
                <Subtitles size={16} />
                <span className="control-label">EN</span>
              </button>

              <button
                title="نمایش / عدم نمایش زیرنویس فارسی"
                onClick={() =>
                  setShowPersian((value) => !value)
                }
                style={{
                  ...smallControlStyle(showPersian),
                  color: showPersian
                    ? COLORS.teal
                    : "rgba(255,255,255,.47)",
                }}
              >
                <Subtitles size={16} />
                <span className="control-label">فا</span>
              </button>

              <div className="mx-divider" />

              <MXButton title="قطع / وصل صدا" onClick={toggleMute}>
                {isMuted || volume === 0 ? (
                  <VolumeX size={18} />
                ) : volume < 0.5 ? (
                  <Volume1 size={18} />
                ) : (
                  <Volume2 size={18} />
                )}
              </MXButton>

              <input
                className="volume-slider"
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={isMuted ? 0 : volume}
                onChange={(event) =>
                  changeVolume(event.target.value)
                }
                style={{
                  width: 70,
                }}
              />

              <span
                className="time-text"
                dir="ltr"
                style={{
                  minWidth: 98,
                  color: "rgba(255,255,255,.72)",
                  fontSize: 11,
                }}
              >
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>

              <select
                title="سرعت پخش"
                value={speed}
                onChange={(event) =>
                  setSpeed(Number(event.target.value))
                }
                style={{
                  height: 31,
                  padding: "0 5px",
                  border: "1px solid rgba(255,255,255,.14)",
                  borderRadius: 6,
                  outline: "none",
                  background: "rgba(255,255,255,.06)",
                  color: "rgba(255,255,255,.8)",
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                {SPEEDS.map((item) => (
                  <option
                    key={item}
                    value={item}
                    style={{ background: "#1C212C" }}
                  >
                    {item}x
                  </option>
                ))}
              </select>

              <MXButton
                title="تنظیمات تصویر و زیرنویس"
                active={settingsVisible}
                onClick={() =>
                  setSettingsVisible((value) => !value)
                }
              >
                <Settings size={18} />
              </MXButton>

              <MXButton
                title="تمام صفحه"
                onClick={toggleFullscreen}
              >
                {isFullscreen ? (
                  <Minimize size={18} />
                ) : (
                  <Maximize size={18} />
                )}
              </MXButton>
            </div>

            <input
              type="range"
              min="0"
              max={duration || 0}
              step="0.01"
              value={currentTime}
              onChange={(event) => {
                const value = Number(event.target.value);

                if (videoRef.current) {
                  videoRef.current.currentTime = value;
                }

                setCurrentTime(value);
              }}
              style={{
                display: controlsVisible ? "block" : "none",
                width: "100%",
                marginTop: 7,
                direction: "ltr",
              }}
            />

            {settingsVisible && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: 15,
                  marginTop: 12,
                  padding: 14,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 10,
                  background: COLORS.panel,
                }}
              >
                <RangeSetting
                  label="روشنایی"
                  value={brightness}
                  min={60}
                  max={150}
                  onChange={setBrightness}
                />

                <RangeSetting
                  label="کنتراست"
                  value={contrast}
                  min={60}
                  max={150}
                  onChange={setContrast}
                />

                <RangeSetting
                  label="اندازه زیرنویس"
                  value={subtitleSize}
                  min={70}
                  max={180}
                  onChange={setSubtitleSize}
                />
              </div>
            )}

            {cues.length > 0 && (
              <section style={{ marginTop: 26 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 10,
                    color: COLORS.muted,
                    fontSize: 12,
                  }}
                >
                  <span>کارت‌های زیرنویس</span>
                  <span>
                    {currentCue >= 0
                      ? `کارت ${currentCue + 1} از ${cues.length}`
                      : `${cues.length} کارت`}
                  </span>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    overflowX: "auto",
                    paddingBottom: 10,
                    direction: "rtl",
                  }}
                >
                  {cues.map((cue, index) => (
                    <div
                      key={cue.id}
                      className="subtitle-card"
                      onClick={() => selectCard(index, true)}
                      style={{
                        minWidth: 235,
                        maxWidth: 235,
                        flexShrink: 0,
                        padding: 12,
                        border: `1px solid ${
                          index === currentCue
                            ? COLORS.yellow
                            : COLORS.border
                        }`,
                        borderRadius: 10,
                        background:
                          index === currentCue
                            ? "#252C39"
                            : COLORS.card,
                        cursor: "pointer",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          marginBottom: 8,
                          color: COLORS.muted,
                          fontSize: 10,
                        }}
                      >
                        <span>کارت {index + 1}</span>
                        <span dir="ltr">
                          {formatTime(cue.start)}
                        </span>
                      </div>

                      {cue.en && (
                        <div
                          dir="ltr"
                          onClick={(event) =>
                            event.stopPropagation()
                          }
                          style={{
                            color: "#FFFFFF",
                            fontSize: 12,
                            lineHeight: 1.8,
                            textAlign: "left",
                          }}
                        >
                          <ClickableEnglishText
                            text={cue.en}
                            onWordClick={handleWordClick}
                          />
                        </div>
                      )}

                      {cue.fa && (
                        <div
                          style={{
                            marginTop: 7,
                            color: COLORS.teal,
                            fontSize: 12,
                            lineHeight: 1.8,
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

        {videoName && (
          <div
            style={{
              marginTop: 12,
              color: COLORS.muted,
              fontSize: 11,
            }}
          >
            ویدیو: {videoName}
          </div>
        )}
      </main>
    </div>
  );
}

function ClickableEnglishText({ text, onWordClick }) {
  const parts = text.split(/(\s+)/);

  return (
    <>
      {parts.map((part, index) => {
        if (!part.trim()) return part;

        const validWord = cleanWord(part);

        if (!validWord) return part;

        return (
          <span
            key={`${part}-${index}`}
            className="english-word"
            title={`ترجمه ${validWord}`}
            onClick={(event) => {
              event.stopPropagation();
              onWordClick(validWord);
            }}
          >
            {part}
          </span>
        );
      })}
    </>
  );
}

function FileInput({ label, accept, onChange }) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: 42,
        padding: "8px 11px",
        border: `1px dashed ${COLORS.border}`,
        borderRadius: 8,
        background: COLORS.card,
        color: COLORS.text,
        fontSize: 12,
        cursor: "pointer",
      }}
    >
      {label}

      <input
        type="file"
        accept={accept}
        onChange={(event) => onChange(event.target.files?.[0])}
        style={{ display: "none" }}
      />
    </label>
  );
}

function MXButton({
  children,
  title,
  onClick,
  primary = false,
  active = false,
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: primary ? 39 : 33,
        height: primary ? 39 : 33,
        padding: 0,
        border: active
          ? `1px solid rgba(255,213,74,.75)`
          : "1px solid transparent",
        borderRadius: primary ? "50%" : 7,
        background: active
          ? "rgba(255,213,74,.15)"
          : primary
          ? "rgba(255,255,255,.12)"
          : "transparent",
        color: active
          ? COLORS.yellow
          : "rgba(255,255,255,.76)",
        cursor: "pointer",
        transition: "background .15s ease, color .15s ease",
      }}
      onMouseEnter={(event) => {
        event.currentTarget.style.background = COLORS.mxHover;
        event.currentTarget.style.color = "#fff";
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.background = active
          ? "rgba(255,213,74,.15)"
          : primary
          ? "rgba(255,255,255,.12)"
          : "transparent";

        event.currentTarget.style.color = active
          ? COLORS.yellow
          : "rgba(255,255,255,.76)";
      }}
    >
      {children}
    </button>
  );
}

function smallControlStyle(active) {
  return {
    display: "flex",
    alignItems: "center",
    gap: 4,
    height: 31,
    padding: "0 7px",
    border: active
      ? "1px solid rgba(255,213,74,.45)"
      : "1px solid transparent",
    borderRadius: 6,
    background: active
      ? "rgba(255,213,74,.10)"
      : "transparent",
    color: active
      ? COLORS.yellow
      : "rgba(255,255,255,.56)",
    fontSize: 10,
    cursor: "pointer",
  };
}

function RangeSetting({
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
        color: COLORS.text,
        fontSize: 11,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 7,
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
        style={{ width: "100%" }}
      />
    </label>
  );
}
