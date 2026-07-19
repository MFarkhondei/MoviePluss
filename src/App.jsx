import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ChevronDown,
  ChevronUp,
  Film,
  Gauge,
  Maximize,
  Minimize,
  Pause,
  Play,
  Repeat,
  Repeat1,
  RotateCcw,
  SkipBack,
  SkipForward,
  Upload,
  X,
} from "lucide-react";
import "vazirmatn/Vazirmatn-font-face.css";

const COLORS = {
  bg: "#101219",
  panel: "#181B25",
  card: "#1F2330",
  active: "#2A2F42",
  yellow: "#F2C94C",
  teal: "#4FD9C0",
  text: "#EDEAE3",
  muted: "#868C9B",
  border: "#2A2E3B",
};

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

      const [startValue, endValue] =
        lines[timeIndex].split("-->");

      const start = timeToSeconds(startValue);
      const end = timeToSeconds(
        endValue?.trim().split(/\s+/)[0]
      );

      const text = lines
        .slice(timeIndex + 1)
        .join(" ")
        .replace(/<[^>]+>/g, "")
        .trim();

      if (!text || Number.isNaN(start) || Number.isNaN(end)) {
        return null;
      }

      return { start, end, text };
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

function formatTime(value = 0) {
  if (!Number.isFinite(value)) return "00:00";

  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);

  return `${String(minutes).padStart(2, "0")}:${String(
    seconds
  ).padStart(2, "0")}`;
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
  const utf8Text = new TextDecoder("utf-8").decode(buffer);
  const replacementCount = (
    utf8Text.match(/\uFFFD/g) || []
  ).length;

  if (replacementCount > 3) {
    return {
      text: decodeBuffer(buffer, "windows-1256"),
      encoding: "windows-1256",
    };
  }

  return {
    text: utf8Text,
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
  const translationPopupRef = useRef(null);

  const cuesRef = useRef([]);
  const currentIndexRef = useRef(-1);
  const repeatRef = useRef(true);

  const seekingRef = useRef(false);
  const userSeekingRef = useRef(false);
  const playAfterSeekRef = useRef(false);

  const translationCacheRef = useRef({});
  const translationDragRef = useRef({
    active: false,
    offsetX: 0,
    offsetY: 0,
  });

  const [videoUrl, setVideoUrl] = useState(null);
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
  const [currentIndex, setCurrentIndex] = useState(-1);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [repeatOn, setRepeatOn] = useState(true);
  const [playbackRate, setPlaybackRate] = useState(1);

  const [filesPanelOpen, setFilesPanelOpen] = useState(true);
  const [showEnglish, setShowEnglish] = useState(true);
  const [showPersian, setShowPersian] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [wordPopup, setWordPopup] = useState(null);

  /*
    پنجره ترجمه ابتدا در بالای سمت راست کادر فیلم قرار می‌گیرد.
    هنگام جابه‌جایی، left و top مقدار می‌گیرند و پنجره
    همچنان داخل کادر فیلم باقی می‌ماند.
  */
  const [translationPosition, setTranslationPosition] =
    useState({
      top: 16,
      left: null,
      right: 16,
    });

  useEffect(() => {
    cuesRef.current = cues;
  }, [cues]);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  useEffect(() => {
    repeatRef.current = repeatOn;
  }, [repeatOn]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(
        document.fullscreenElement === playerRef.current
      );
    };

    document.addEventListener(
      "fullscreenchange",
      handleFullscreenChange
    );

    return () => {
      document.removeEventListener(
        "fullscreenchange",
        handleFullscreenChange
      );
    };
  }, []);

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  useEffect(() => {
    if (currentIndex < 0 || !cardsRef.current) return;

    cardsRef.current
      .querySelector(`[data-frame="${currentIndex}"]`)
      ?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
  }, [currentIndex]);

  const playVideo = useCallback(async () => {
    if (!videoRef.current) return;

    try {
      await videoRef.current.play();
      setIsPlaying(true);
    } catch {
      setIsPlaying(false);
    }
  }, []);

  const pauseVideo = useCallback(() => {
    if (!videoRef.current) return;

    videoRef.current.pause();
    setIsPlaying(false);
  }, []);

  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;

    if (videoRef.current.paused) {
      playVideo();
    } else {
      pauseVideo();
    }
  }, [playVideo, pauseVideo]);

  const toggleFullscreen = useCallback(async () => {
    if (!playerRef.current) return;

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await playerRef.current.requestFullscreen();
      }
    } catch (error) {
      console.error("Fullscreen error:", error);
    }
  }, []);

  const jumpToCue = useCallback((index, autoplay = true) => {
    const video = videoRef.current;
    const cue = cuesRef.current[index];

    if (!video || !cue) return;

    currentIndexRef.current = index;
    setCurrentIndex(index);
    setWordPopup(null);

    seekingRef.current = true;
    userSeekingRef.current = false;
    playAfterSeekRef.current = autoplay;

    video.currentTime = cue.start;
  }, []);

  // دکمه سمت چپ: کارت بعدی
  const nextSentence = useCallback(() => {
    const nextIndex = currentIndexRef.current + 1;

    if (nextIndex < cuesRef.current.length) {
      jumpToCue(nextIndex, true);
    }
  }, [jumpToCue]);

  // دکمه سمت راست: کارت قبلی
  const previousSentence = useCallback(() => {
    const previousIndex = currentIndexRef.current - 1;

    if (previousIndex >= 0) {
      jumpToCue(previousIndex, true);
    }
  }, [jumpToCue]);

  const replaySentence = useCallback(() => {
    if (currentIndexRef.current >= 0) {
      jumpToCue(currentIndexRef.current, true);
    }
  }, [jumpToCue]);

  const handleTimeUpdate = () => {
    const video = videoRef.current;

    if (!video) return;

    const time = video.currentTime;
    setCurrentTime(time);

    if (seekingRef.current || userSeekingRef.current) return;

    const list = cuesRef.current;
    const lockedIndex = currentIndexRef.current;

    if (
      repeatRef.current &&
      lockedIndex >= 0 &&
      list[lockedIndex]
    ) {
      const currentCue = list[lockedIndex];
      const nextCue = list[lockedIndex + 1];

      const boundary = nextCue
        ? nextCue.start
        : currentCue.end;

      if (time >= boundary - 0.04) {
        seekingRef.current = true;
        playAfterSeekRef.current = !video.paused;
        video.currentTime = currentCue.start;
      }

      return;
    }

    const detectedIndex = list.findIndex(
      (cue) => time >= cue.start && time < cue.end
    );

    if (
      detectedIndex !== -1 &&
      detectedIndex !== currentIndexRef.current
    ) {
      currentIndexRef.current = detectedIndex;
      setCurrentIndex(detectedIndex);
    }
  };

  const handleSeeked = () => {
    if (!seekingRef.current) return;

    seekingRef.current = false;

    if (playAfterSeekRef.current) {
      playAfterSeekRef.current = false;
      playVideo();
    } else {
      playAfterSeekRef.current = false;
    }
  };

  const handleVideoFile = (event) => {
    const file = event.target.files?.[0];

    if (!file) return;

    if (videoUrl) URL.revokeObjectURL(videoUrl);

    setVideoUrl(URL.createObjectURL(file));
    setVideoName(file.name);
    setCurrentTime(0);
    setDuration(0);
    setCurrentIndex(-1);
    setIsPlaying(false);
    setWordPopup(null);

    currentIndexRef.current = -1;
    seekingRef.current = false;
    playAfterSeekRef.current = false;
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

  const handleEncodingChange = async (language, encoding) => {
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
    setCues(mergeSubtitles(englishText, persianText));
    setCurrentIndex(-1);
    currentIndexRef.current = -1;
  };

  const handleProgressMouseDown = () => {
    userSeekingRef.current = true;
    seekingRef.current = false;
    playAfterSeekRef.current = false;
  };

  const handleProgressChange = (event) => {
    setCurrentTime(Number(event.target.value));
  };

  const handleProgressMouseUp = (event) => {
    const video = videoRef.current;

    if (!video) return;

    seekingRef.current = true;
    playAfterSeekRef.current = !video.paused;
    video.currentTime = Number(event.target.value);

    setTimeout(() => {
      userSeekingRef.current = false;
    }, 150);
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

  /*
    کلمات انگلیسی زیرنویس روی خود فیلم نیز قابل کلیک هستند.
  */
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
          title="برای نمایش ترجمه کلیک کنید"
          style={{
            cursor: "pointer",
            pointerEvents: "auto",
            borderBottom: `1px dotted ${COLORS.yellow}`,
          }}
        >
          {token}
        </span>
      );
    });
  };

  /*
    شروع کشیدن پنجره ترجمه
  */
  const handleTranslationPointerDown = (event) => {
    if (!translationPopupRef.current || !playerRef.current) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const popupRect =
      translationPopupRef.current.getBoundingClientRect();

    translationDragRef.current = {
      active: true,
      offsetX: event.clientX - popupRect.left,
      offsetY: event.clientY - popupRect.top,
    };

    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  /*
    حرکت پنجره ترجمه؛ مختصات نسبت به کادر فیلم محاسبه می‌شود،
    بنابراین در حالت تمام‌صفحه نیز داخل فیلم باقی می‌ماند.
  */
  const handleTranslationPointerMove = (event) => {
    if (
      !translationDragRef.current.active ||
      !translationPopupRef.current ||
      !playerRef.current
    ) {
      return;
    }

    const playerRect =
      playerRef.current.getBoundingClientRect();

    const popupRect =
      translationPopupRef.current.getBoundingClientRect();

    let left =
      event.clientX -
      playerRect.left -
      translationDragRef.current.offsetX;

    let top =
      event.clientY -
      playerRect.top -
      translationDragRef.current.offsetY;

    const maxLeft = Math.max(
      8,
      playerRect.width - popupRect.width - 8
    );

    const maxTop = Math.max(
      8,
      playerRect.height - popupRect.height - 8
    );

    left = Math.max(8, Math.min(left, maxLeft));
    top = Math.max(8, Math.min(top, maxTop));

    setTranslationPosition({
      top,
      left,
      right: null,
    });
  };

  const handleTranslationPointerUp = () => {
    translationDragRef.current.active = false;
  };

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
  }, []);

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

      if (event.code === "ArrowLeft") {
        event.preventDefault();
        nextSentence();
      }

      if (event.code === "ArrowRight") {
        event.preventDefault();
        previousSentence();
      }

      if (event.code === "KeyR") {
        event.preventDefault();
        replaySentence();
      }

      if (event.code === "KeyF") {
        event.preventDefault();
        toggleFullscreen();
      }
    };

    window.addEventListener("keydown", handleKeyboard);

    return () => {
      window.removeEventListener("keydown", handleKeyboard);
    };
  }, [
    togglePlay,
    nextSentence,
    previousSentence,
    replaySentence,
    toggleFullscreen,
  ]);

  const activeCue =
    currentIndex >= 0 ? cues[currentIndex] : null;

  const englishCount = useMemo(
    () => parseSubtitleText(englishText).length,
    [englishText]
  );

  const persianCount = useMemo(
    () => parseSubtitleText(persianText).length,
    [persianText]
  );

  return (
    <div className="movie-pluss" dir="rtl">
      <style>{`
        * {
          box-sizing: border-box;
        }

        body {
          margin: 0;
          background: ${COLORS.bg};
        }

        .movie-pluss {
          min-height: 100vh;
          background: ${COLORS.bg};
          color: ${COLORS.text};
          font-family: Vazirmatn, Tahoma, sans-serif;
        }

        button,
        input,
        select,
        textarea {
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
          background: ${COLORS.border};
          border-radius: 4px;
        }

        input[type="range"]::-webkit-slider-thumb {
          appearance: none;
          width: 13px;
          height: 13px;
          margin-top: -4.5px;
          border-radius: 50%;
          background: ${COLORS.yellow};
        }

        .frame-card:hover {
          border-color: ${COLORS.yellow} !important;
        }

        /*
          مهم:
          پنجره ترجمه absolute است و داخل playerRef قرار دارد.
          به همین دلیل همراه کادر فیلم وارد حالت تمام‌صفحه می‌شود.
        */
        .fullscreen-player:fullscreen {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100vw;
          height: 100vh;
          border: none;
          border-radius: 0;
        }

        .fullscreen-player:fullscreen video {
          width: 100%;
          height: 100%;
          max-height: 100vh;
          object-fit: contain;
        }

        .word-translation-popup {
          position: absolute;
          z-index: 30;
          width: min(300px, calc(100% - 32px));
          user-select: none;
          touch-action: none;
        }

        .translation-drag-handle {
          touch-action: none;
          cursor: grab;
        }

        .translation-drag-handle:active {
          cursor: grabbing;
        }

        ::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }

        ::-webkit-scrollbar-thumb {
          background: ${COLORS.border};
          border-radius: 5px;
        }
      `}</style>

      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          padding: "18px 20px",
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
                fontSize: 25,
                fontWeight: 800,
              }}
            >
              فیلم پلاس
            </div>

            <div
              style={{
                color: COLORS.muted,
                fontSize: 12,
              }}
            >
              تمرین زبان با فیلم؛ جمله به جمله
            </div>
          </div>
        </div>

        <button
          onClick={() =>
            setFilesPanelOpen((value) => !value)
          }
          style={buttonStyle()}
        >
          <Upload size={15} />
          فایل‌ها
          {filesPanelOpen ? (
            <ChevronUp size={15} />
          ) : (
            <ChevronDown size={15} />
          )}
        </button>
      </header>

      {filesPanelOpen && (
        <section
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 16,
            padding: 20,
            background: COLORS.panel,
            borderBottom: `1px solid ${COLORS.border}`,
          }}
        >
          <label style={uploadLabelStyle()}>
            <Upload size={15} color={COLORS.yellow} />
            {videoName || "انتخاب فایل ویدیو"}

            <input
              type="file"
              accept="video/*"
              onChange={handleVideoFile}
              style={{ display: "none" }}
            />
          </label>

          <SubtitleBox
            title="زیرنویس انگلیسی"
            language="en"
            file={englishFile}
            text={englishText}
            encoding={englishEncoding}
            color={COLORS.yellow}
            onFile={handleSubtitleFile}
            onTextChange={setEnglishText}
            onEncodingChange={handleEncodingChange}
          />

          <SubtitleBox
            title="زیرنویس فارسی"
            language="fa"
            file={persianFile}
            text={persianText}
            encoding={persianEncoding}
            color={COLORS.teal}
            onFile={handleSubtitleFile}
            onTextChange={setPersianText}
            onEncodingChange={handleEncodingChange}
          />

          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
            }}
          >
            <button
              onClick={applySubtitles}
              style={{
                width: "100%",
                padding: "11px 14px",
                border: "none",
                borderRadius: 8,
                background: COLORS.yellow,
                color: "#171717",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              اعمال زیرنویس‌ها ({englishCount} /{" "}
              {persianCount})
            </button>
          </div>
        </section>
      )}

      {!videoUrl ? (
        <div
          style={{
            padding: 70,
            color: COLORS.muted,
            textAlign: "center",
          }}
        >
          برای شروع، یک فایل ویدیویی انتخاب کنید.
        </div>
      ) : (
        <main
          style={{
            maxWidth: 1000,
            margin: "0 auto",
            padding: 20,
          }}
        >
          <div
            ref={playerRef}
            className="fullscreen-player"
            style={{
              position: "relative",
              overflow: "hidden",
              border: `1px solid ${COLORS.border}`,
              borderRadius: 12,
              background: "#000",
            }}
          >
            <video
              ref={videoRef}
              src={videoUrl}
              onTimeUpdate={handleTimeUpdate}
              onSeeked={handleSeeked}
              onLoadedMetadata={(event) =>
                setDuration(event.currentTarget.duration)
              }
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onDoubleClick={toggleFullscreen}
              style={{
                display: "block",
                width: "100%",
                maxHeight: "58vh",
                background: "#000",
                cursor: "pointer",
              }}
            />

            {/*
              پنجره ترجمه داخل کادر فیلم است؛
              بنابراین در حالت عادی در بالا سمت راست و
              در حالت تمام‌صفحه نیز قابل مشاهده است.
            */}
            {wordPopup && (
              <div
                ref={translationPopupRef}
                className="word-translation-popup"
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
                    background: "rgba(10, 11, 16, 0.97)",
                    boxShadow:
                      "0 8px 30px rgba(0, 0, 0, 0.45)",
                  }}
                >
                  <div
                    className="translation-drag-handle"
                    onPointerDown={
                      handleTranslationPointerDown
                    }
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      padding: "8px 12px",
                      borderBottom: `1px solid ${COLORS.border}`,
                      background:
                        "rgba(42, 47, 66, 0.95)",
                      color: COLORS.muted,
                      fontSize: 11,
                    }}
                  >
                    <span>برای جابه‌جایی بکشید</span>

                    <button
                      onPointerDown={(event) => {
                        event.stopPropagation();
                      }}
                      onClick={() => setWordPopup(null)}
                      title="بستن ترجمه"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: 2,
                        border: "none",
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
                      padding: "11px 13px",
                      direction: "rtl",
                    }}
                  >
                    <div
                      style={{
                        color: COLORS.yellow,
                        fontSize: 14,
                        fontWeight: 800,
                        direction: "ltr",
                        textAlign: "left",
                      }}
                    >
                      {wordPopup.word}
                    </div>

                    <div
                      style={{
                        marginTop: 5,
                        color: COLORS.teal,
                        fontSize: 14,
                        lineHeight: 1.7,
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
                  bottom: 14,
                  left: 0,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 4,
                  padding: "0 16px",
                  pointerEvents: "none",
                }}
              >
                {showEnglish && activeCue.en && (
                  <div
                    style={{
                      maxWidth: "90%",
                      padding: "4px 12px",
                      borderRadius: 6,
                      background: "rgba(0,0,0,.75)",
                      color: COLORS.yellow,
                      fontSize: 17,
                      fontWeight: 600,
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
                      maxWidth: "90%",
                      padding: "4px 12px",
                      borderRadius: 6,
                      background: "rgba(0,0,0,.75)",
                      color: COLORS.teal,
                      fontSize: 17,
                      fontWeight: 600,
                      textAlign: "center",
                      pointerEvents: "none",
                    }}
                  >
                    {activeCue.fa}
                  </div>
                )}
              </div>
            )}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginTop: 14,
            }}
          >
            <input
              type="range"
              min="0"
              max={duration || 0}
              step="0.01"
              value={currentTime}
              onMouseDown={handleProgressMouseDown}
              onMouseUp={handleProgressMouseUp}
              onTouchStart={handleProgressMouseDown}
              onTouchEnd={handleProgressMouseUp}
              onChange={handleProgressChange}
              style={{
                display: "block",
                flex: 1,
              }}
            />

            <button
              onClick={toggleFullscreen}
              title={
                isFullscreen
                  ? "خروج از حالت تمام صفحه"
                  : "حالت تمام صفحه"
              }
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 38,
                height: 32,
                flexShrink: 0,
                border: `1px solid ${
                  isFullscreen
                    ? COLORS.yellow
                    : COLORS.border
                }`,
                borderRadius: 7,
                background: isFullscreen
                  ? "rgba(242,201,76,.15)"
                  : COLORS.card,
                color: isFullscreen
                  ? COLORS.yellow
                  : COLORS.text,
                cursor: "pointer",
              }}
            >
              {isFullscreen ? (
                <Minimize size={17} />
              ) : (
                <Maximize size={17} />
              )}
            </button>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: -2,
              color: COLORS.muted,
              fontSize: 11,
              direction: "ltr",
            }}
          >
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              flexWrap: "wrap",
              marginTop: 16,
              direction: "rtl",
            }}
          >
            {/* تکرار جمله و سرعت در سمت راست کلیدها */}
            <button
              onClick={() => setRepeatOn((value) => !value)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                height: 40,
                padding: "0 14px",
                border: `1px solid ${
                  repeatOn
                    ? COLORS.yellow
                    : COLORS.border
                }`,
                borderRadius: 20,
                background: repeatOn
                  ? "rgba(242,201,76,.15)"
                  : COLORS.card,
                color: repeatOn
                  ? COLORS.yellow
                  : COLORS.text,
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {repeatOn ? (
                <Repeat1 size={18} />
              ) : (
                <Repeat size={18} />
              )}
              تکرار: {repeatOn ? "فعال" : "غیرفعال"}
            </button>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                height: 40,
                padding: "0 12px",
                border: `1px solid ${COLORS.border}`,
                borderRadius: 20,
                background: COLORS.card,
              }}
            >
              <Gauge size={15} color={COLORS.muted} />

              <select
                value={playbackRate}
                onChange={(event) =>
                  setPlaybackRate(
                    Number(event.target.value)
                  )
                }
                style={{
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  color: COLORS.text,
                  cursor: "pointer",
                }}
              >
                {[0.5, 0.75, 1, 1.25, 1.5].map(
                  (rate) => (
                    <option
                      key={rate}
                      value={rate}
                      style={{
                        background: COLORS.card,
                      }}
                    >
                      {rate}x
                    </option>
                  )
                )}
              </select>
            </div>

            {/* سمت راست: کارت قبلی */}
            <IconButton
              onClick={previousSentence}
              title="کارت قبلی"
            >
              <SkipForward size={18} />
            </IconButton>

            <IconButton
              onClick={togglePlay}
              title="پخش / توقف"
              large
            >
              {isPlaying ? (
                <Pause size={22} />
              ) : (
                <Play size={22} />
              )}
            </IconButton>

            {/* سمت چپ: کارت بعدی */}
            <IconButton
              onClick={nextSentence}
              title="کارت بعدی"
            >
              <SkipBack size={18} />
            </IconButton>

            <IconButton
              onClick={replaySentence}
              title="شروع مجدد کارت"
            >
              <RotateCcw size={18} />
            </IconButton>

            <ToggleButton
              label="EN"
              active={showEnglish}
              color={COLORS.yellow}
              onClick={() =>
                setShowEnglish((value) => !value)
              }
            />

            <ToggleButton
              label="FA"
              active={showPersian}
              color={COLORS.teal}
              onClick={() =>
                setShowPersian((value) => !value)
              }
            />
          </div>

          {cues.length > 0 && (
            <section style={{ marginTop: 25 }}>
              <div
                style={{
                  marginBottom: 9,
                  color: COLORS.muted,
                  fontSize: 12,
                }}
              >
                کارت‌ها ({cues.length}) — برای پخش روی
                کارت کلیک کنید
              </div>

              <div
                ref={cardsRef}
                style={{
                  display: "flex",
                  flexDirection: "row",
                  gap: 10,
                  overflowX: "auto",
                  paddingBottom: 10,
                  direction: "rtl",
                }}
              >
                {cues.map((cue, index) => (
                  <div
                    key={index}
                    data-frame={index}
                    className="frame-card"
                    onClick={() => jumpToCue(index, true)}
                    style={{
                      minWidth: 215,
                      maxWidth: 215,
                      flexShrink: 0,
                      padding: "9px 10px",
                      border: `1px solid ${
                        index === currentIndex
                          ? COLORS.yellow
                          : COLORS.border
                      }`,
                      borderRadius: 10,
                      background:
                        index === currentIndex
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
                        marginBottom: 7,
                        color: COLORS.muted,
                        fontSize: 10,
                      }}
                    >
                      <span>
                        کارت{" "}
                        {String(cue.index).padStart(2, "0")}
                      </span>

                      <span>{formatTime(cue.start)}</span>
                    </div>

                    {cue.en && (
                      <div
                        style={{
                          marginBottom: 5,
                          color: COLORS.yellow,
                          fontSize: 12.5,
                          lineHeight: 1.45,
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
                          color: COLORS.teal,
                          fontSize: 12.5,
                          lineHeight: 1.5,
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
        </main>
      )}
    </div>
  );
}

function SubtitleBox({
  title,
  language,
  file,
  text,
  encoding,
  color,
  onFile,
  onTextChange,
  onEncodingChange,
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
          gap: 8,
          marginBottom: 6,
          padding: "8px 12px",
          border: `1px dashed ${COLORS.border}`,
          borderRadius: 8,
          background: COLORS.card,
          color: COLORS.text,
          fontSize: 12,
          cursor: "pointer",
        }}
      >
        <Upload size={14} color={color} />
        {file ? file.name : "بارگذاری فایل"}

        <input
          type="file"
          accept=".srt,.vtt,.txt,text/plain"
          onChange={(event) => {
            const selectedFile = event.target.files?.[0];

            if (selectedFile) {
              onFile(selectedFile, language);
            }
          }}
          style={{ display: "none" }}
        />
      </label>

      <select
        value={encoding}
        onChange={(event) =>
          onEncodingChange(language, event.target.value)
        }
        style={{
          width: "100%",
          marginBottom: 6,
          padding: 7,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 7,
          outline: "none",
          background: COLORS.card,
          color: COLORS.text,
          fontSize: 11,
        }}
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
        onChange={(event) =>
          onTextChange(event.target.value)
        }
        placeholder="متن زیرنویس را وارد کنید..."
        dir={language === "fa" ? "rtl" : "ltr"}
        style={{
          width: "100%",
          height: 68,
          padding: 8,
          resize: "vertical",
          border: `1px solid ${COLORS.border}`,
          borderRadius: 8,
          outline: "none",
          background: COLORS.card,
          color: COLORS.text,
          fontFamily:
            language === "en" ? "monospace" : "inherit",
          fontSize: 12,
        }}
      />
    </div>
  );
}

function IconButton({
  children,
  onClick,
  title,
  large = false,
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: large ? 52 : 40,
        height: large ? 52 : 40,
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

function ToggleButton({
  label,
  active,
  color,
  onClick,
}) {
  return (
    <button
      onClick={onClick}
      style={{
        height: 40,
        padding: "0 14px",
        border: `1px solid ${
          active ? color : COLORS.border
        }`,
        borderRadius: 20,
        background: active ? `${color}22` : COLORS.card,
        color: active ? color : COLORS.muted,
        fontSize: 12,
        fontWeight: 700,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

function buttonStyle() {
  return {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 12px",
    border: `1px solid ${COLORS.border}`,
    borderRadius: 8,
    background: COLORS.card,
    color: COLORS.text,
    fontSize: 13,
    cursor: "pointer",
  };
}

function uploadLabelStyle() {
  return {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 12px",
    border: `1px dashed ${COLORS.border}`,
    borderRadius: 8,
    background: COLORS.card,
    color: COLORS.text,
    fontSize: 13,
    cursor: "pointer",
  };
}
