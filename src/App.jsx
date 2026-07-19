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

  const content = raw
    .replace(/\r/g, "")
    .replace(/^WEBVTT.*\n+/i, "");

  return content
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split("\n");
      const timeIndex = lines.findIndex((line) =>
        line.includes("-->")
      );

      if (timeIndex === -1) return null;

      const timeLine = lines[timeIndex];
      const [startValue, endValue] = timeLine.split("-->");

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
  const englishCues = parseSubtitleText(englishText);
  const persianCues = parseSubtitleText(persianText);
  const count = Math.max(
    englishCues.length,
    persianCues.length
  );

  return Array.from({ length: count }, (_, index) => {
    const englishCue = englishCues[index];
    const persianCue = persianCues[index];
    const baseCue = englishCue || persianCue;

    return {
      index: index + 1,
      start: baseCue?.start || 0,
      end: baseCue?.end || 0,
      en: englishCue?.text || "",
      fa: persianCue?.text || "",
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

async function decodeFile(file, encoding) {
  const buffer = await file.arrayBuffer();
  return decodeBuffer(buffer, encoding);
}

async function autoDecodeFile(file) {
  const buffer = await file.arrayBuffer();

  const utf8Text = new TextDecoder("utf-8", {
    fatal: false,
  }).decode(buffer);

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

export default function MoviePluss() {
  const videoRef = useRef(null);
  const cardsRef = useRef(null);

  const cuesRef = useRef([]);
  const currentIndexRef = useRef(-1);
  const repeatRef = useRef(true);

  const seekingRef = useRef(false);
  const userSeekingRef = useRef(false);
  const playAfterSeekRef = useRef(false);

  const translationCacheRef = useRef({});

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

  const [wordPopup, setWordPopup] = useState(null);

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
    return () => {
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
      }
    };
  }, [videoUrl]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate, videoUrl]);

  useEffect(() => {
    if (currentIndex < 0 || !cardsRef.current) return;

    const activeCard = cardsRef.current.querySelector(
      `[data-frame="${currentIndex}"]`
    );

    if (activeCard) {
      activeCard.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }
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
  }, [pauseVideo, playVideo]);

  const jumpToCue = useCallback(
    (index, autoplay = true) => {
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
    },
    []
  );

  const nextSentence = useCallback(() => {
    const nextIndex = currentIndexRef.current + 1;

    if (nextIndex < cuesRef.current.length) {
      jumpToCue(nextIndex, true);
    }
  }, [jumpToCue]);

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

    if (seekingRef.current || userSeekingRef.current) {
      return;
    }

    const list = cuesRef.current;
    const lockedIndex = currentIndexRef.current;

    /*
     * در حالت تکرار، پخش از ابتدای کارت فعال شروع می‌شود
     * و تا ابتدای کارت بعدی ادامه پیدا می‌کند؛ سپس دوباره
     * به ابتدای همان کارت برمی‌گردد.
     */
    if (
      repeatRef.current &&
      lockedIndex >= 0 &&
      list[lockedIndex]
    ) {
      const currentCue = list[lockedIndex];
      const nextCue = list[lockedIndex + 1];

      const repeatBoundary = nextCue
        ? nextCue.start
        : currentCue.end;

      if (time >= repeatBoundary - 0.04) {
        const shouldPlay = !video.paused;

        seekingRef.current = true;
        playAfterSeekRef.current = shouldPlay;
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
    if (!videoRef.current || !seekingRef.current) {
      return;
    }

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

    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
    }

    setVideoUrl(URL.createObjectURL(file));
    setVideoName(file.name);
    setCurrentTime(0);
    setDuration(0);
    setCurrentIndex(-1);
    setIsPlaying(false);

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
        const decodedText = await decodeFile(
          englishFile,
          encoding
        );

        setEnglishText(decodedText);
      }
    } else {
      setPersianEncoding(encoding);

      if (persianFile) {
        const decodedText = await decodeFile(
          persianFile,
          encoding
        );

        setPersianText(decodedText);
      }
    }
  };

  const applySubtitles = () => {
    const mergedCues = mergeSubtitles(
      englishText,
      persianText
    );

    setCues(mergedCues);
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

    const targetTime = Number(event.target.value);

    seekingRef.current = true;
    playAfterSeekRef.current = !video.paused;
    video.currentTime = targetTime;

    setTimeout(() => {
      userSeekingRef.current = false;
    }, 150);
  };

  const translateWord = async (rawWord) => {
    const word = rawWord.replace(/[^A-Za-z'-]/g, "");

    if (!word) return;

    const cacheKey = word.toLowerCase();

    if (translationCacheRef.current[cacheKey]) {
      setWordPopup({
        word,
        translation: translationCacheRef.current[cacheKey],
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

      translationCacheRef.current[cacheKey] = translation;

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

  const renderEnglish = (text, keyPrefix) => {
    return text.split(/(\s+)/).map((token, index) => {
      if (/^\s+$/.test(token)) {
        return token;
      }

      return (
        <span
          key={`${keyPrefix}-${index}`}
          onClick={(event) => {
            event.stopPropagation();
            translateWord(token);
          }}
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

  useEffect(() => {
    const handleKeyboard = (event) => {
      const activeTag = document.activeElement?.tagName;

      if (
        activeTag === "INPUT" ||
        activeTag === "TEXTAREA" ||
        activeTag === "SELECT"
      ) {
        return;
      }

      if (event.code === "Space") {
        event.preventDefault();
        togglePlay();
      }

      /*
       * عملکرد کلیدها مانند حالت قبل باقی مانده است:
       * ArrowLeft  = قبلی
       * ArrowRight = بعدی
       */
      if (event.code === "ArrowLeft") {
        event.preventDefault();
        previousSentence();
      }

      if (event.code === "ArrowRight") {
        event.preventDefault();
        nextSentence();
      }

      if (event.code === "KeyR") {
        event.preventDefault();
        replaySentence();
      }
    };

    window.addEventListener("keydown", handleKeyboard);

    return () => {
      window.removeEventListener("keydown", handleKeyboard);
    };
  }, [
    nextSentence,
    previousSentence,
    replaySentence,
    togglePlay,
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
          <div>
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
          </div>

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
              style={{
                display: "block",
                width: "100%",
                maxHeight: "58vh",
                background: "#000",
              }}
            />

            {wordPopup && (
              <div
                style={{
                  position: "absolute",
                  top: 10,
                  left: 10,
                  zIndex: 3,
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  maxWidth: "80%",
                  padding: "8px 12px",
                  border: `1px solid ${COLORS.teal}`,
                  borderRadius: 8,
                  background: "rgba(10,11,16,.94)",
                }}
              >
                <div>
                  <div
                    style={{
                      color: COLORS.yellow,
                      fontSize: 13,
                      fontWeight: 700,
                    }}
                  >
                    {wordPopup.word}
                  </div>

                  <div
                    dir="rtl"
                    style={{
                      marginTop: 3,
                      color: COLORS.teal,
                      fontSize: 13,
                    }}
                  >
                    {wordPopup.loading
                      ? "در حال دریافت ترجمه..."
                      : wordPopup.translation}
                  </div>
                </div>

                <button
                  onClick={() => setWordPopup(null)}
                  style={{
                    display: "flex",
                    border: "none",
                    background: "transparent",
                    color: COLORS.muted,
                    cursor: "pointer",
                  }}
                >
                  <X size={15} />
                </button>
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
                    }}
                  >
                    {renderEnglish(activeCue.en, "overlay")}
                  </div>
                )}

                {showPersian && activeCue.fa && (
                  <div
                    dir="rtl"
                    style={{
                      maxWidth: "90%",
                      padding: "4px 12px",
                      borderRadius: 6,
                      background: "rgba(0,0,0,.75)",
                      color: COLORS.teal,
                      fontSize: 17,
                      fontWeight: 600,
                      textAlign: "center",
                    }}
                  >
                    {activeCue.fa}
                  </div>
                )}
              </div>
            )}
          </div>

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
              marginTop: 14,
            }}
          />

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
              direction: "ltr",
            }}
          >
            {/* فقط جای دکمه قبلی به سمت چپ منتقل شده است */}
            <IconButton
              onClick={previousSentence}
              title="جمله قبلی"
            >
              <SkipBack size={18} />
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

            {/* فقط جای دکمه بعدی به سمت راست منتقل شده است */}
            <IconButton
              onClick={nextSentence}
              title="جمله بعدی"
            >
              <SkipForward size={18} />
            </IconButton>

            <IconButton
              onClick={replaySentence}
              title="شروع مجدد جمله"
            >
              <RotateCcw size={18} />
            </IconButton>

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
                  gap: 10,
                  overflowX: "auto",
                  paddingBottom: 10,
                  direction: "ltr",
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
                        dir="rtl"
                        style={{
                          color: COLORS.teal,
                          fontSize: 12.5,
                          lineHeight: 1.5,
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
            style={{
              background: COLORS.card,
            }}
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
