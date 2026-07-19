import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import "vazirmatn/Vazirmatn-font-face.css";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Repeat,
  Repeat1,
  Upload,
  Film,
  Gauge,
  RotateCcw,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

const C = {
  bg: "#101219",
  panel: "#181B25",
  card: "#1F2330",
  cardActive: "#2A2F42",
  yellow: "#F2C94C",
  teal: "#4FD9C0",
  text: "#EDEAE3",
  muted: "#868C9B",
  border: "#2A2E3B",
};

const ENCODINGS = [
  { value: "utf-8", label: "UTF-8 (پیش‌فرض)" },
  { value: "windows-1256", label: "Windows-1256" },
  { value: "iso-8859-6", label: "ISO-8859-6" },
  { value: "windows-1252", label: "Windows-1252" },
];

function timeToSeconds(value) {
  const normalized = value.trim().replace(",", ".");
  const parts = normalized.split(":").map(Number);

  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }

  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }

  return Number(parts[0]) || 0;
}

function parseSubtitleText(raw) {
  if (!raw || !raw.trim()) return [];

  const text = raw
    .replace(/\r/g, "")
    .replace(/^WEBVTT.*\n+/i, "");

  const blocks = text
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);

  const cues = [];

  for (const block of blocks) {
    const lines = block.split("\n");
    const timeLineIndex = lines.findIndex((line) =>
      line.includes("-->")
    );

    if (timeLineIndex === -1) continue;

    const [startRaw, endRaw] =
      lines[timeLineIndex].split("-->");

    const start = timeToSeconds(startRaw);
    const end = timeToSeconds(
      (endRaw || "").trim().split(/\s+/)[0]
    );

    const content = lines
      .slice(timeLineIndex + 1)
      .join(" ")
      .replace(/<[^>]+>/g, "")
      .trim();

    if (!content || Number.isNaN(start) || Number.isNaN(end)) {
      continue;
    }

    cues.push({
      start,
      end,
      text: content,
    });
  }

  return cues.sort((a, b) => a.start - b.start);
}

function mergeCues(enCues, faCues) {
  const length = Math.max(enCues.length, faCues.length);
  const result = [];

  for (let i = 0; i < length; i++) {
    const en = enCues[i];
    const fa = faCues[i];
    const base = en || fa;

    if (!base) continue;

    result.push({
      index: i + 1,
      start: base.start,
      end: base.end,
      en: en?.text || "",
      fa: fa?.text || "",
    });
  }

  return result;
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "00:00";

  const minutes = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);

  return `${String(minutes).padStart(2, "0")}:${String(
    sec
  ).padStart(2, "0")}`;
}

function decodeBuffer(buffer, encoding) {
  try {
    return new TextDecoder(encoding, {
      fatal: false,
    }).decode(buffer);
  } catch {
    return new TextDecoder("utf-8", {
      fatal: false,
    }).decode(buffer);
  }
}

async function decodeFile(file, encoding) {
  const buffer = await file.arrayBuffer();
  return decodeBuffer(buffer, encoding);
}

async function decodeAuto(file) {
  const buffer = await file.arrayBuffer();

  const utf8Text = new TextDecoder("utf-8", {
    fatal: false,
  }).decode(buffer);

  const replacementCount = (utf8Text.match(/\uFFFD/g) || [])
    .length;

  if (replacementCount > 3) {
    return {
      text: decodeBuffer(buffer, "windows-1256"),
      encoding: "windows-1256",
    };
  }

  const hasArabic =
    /[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(
      utf8Text
    );

  if (!hasArabic && buffer.byteLength > 50) {
    const hasHighBytes = Array.from(
      new Uint8Array(buffer)
    ).some((byte) => byte > 0x7f);

    if (hasHighBytes) {
      const windowsText = decodeBuffer(
        buffer,
        "windows-1256"
      );

      if (
        /[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(
          windowsText
        )
      ) {
        return {
          text: windowsText,
          encoding: "windows-1256",
        };
      }
    }
  }

  return {
    text: utf8Text,
    encoding: "utf-8",
  };
}

export default function MoviePluss() {
  const [videoUrl, setVideoUrl] = useState(null);
  const [videoName, setVideoName] = useState("");

  const [enFile, setEnFile] = useState(null);
  const [faFile, setFaFile] = useState(null);

  const [enEncoding, setEnEncoding] = useState("utf-8");
  const [faEncoding, setFaEncoding] = useState("utf-8");

  const [enText, setEnText] = useState("");
  const [faText, setFaText] = useState("");

  const [cues, setCues] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(-1);

  const [isPlaying, setIsPlaying] = useState(false);
  const [repeatOn, setRepeatOn] = useState(true);
  const [rate, setRate] = useState(1);

  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);

  const [panelOpen, setPanelOpen] = useState(true);
  const [showEn, setShowEn] = useState(true);
  const [showFa, setShowFa] = useState(true);

  const [wordPopup, setWordPopup] = useState(null);

  const videoRef = useRef(null);
  const stripRef = useRef(null);

  const translationCache = useRef({});
  const cuesRef = useRef([]);
  const currentIndexRef = useRef(-1);
  const repeatRef = useRef(true);

  const seekingRef = useRef(false);
  const userSeekingRef = useRef(false);
  const playAfterSeekRef = useRef(false);

  useEffect(() => {
    cuesRef.current = cues;
  }, [cues]);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  useEffect(() => {
    repeatRef.current = repeatOn;
  }, [repeatOn]);

  const enCueCount = useMemo(
    () => parseSubtitleText(enText).length,
    [enText]
  );

  const faCueCount = useMemo(
    () => parseSubtitleText(faText).length,
    [faText]
  );

  useEffect(() => {
    return () => {
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
      }
    };
  }, [videoUrl]);

  const onVideoFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
    }

    const url = URL.createObjectURL(file);

    setVideoUrl(url);
    setVideoName(file.name);
    setIsPlaying(false);
    setCurrent(0);
    setDuration(0);
    setCurrentIndex(-1);

    currentIndexRef.current = -1;
    seekingRef.current = false;
    playAfterSeekRef.current = false;
  };

  const onSubtitleFile = async (file, language) => {
    if (!file) return;

    const result = await decodeAuto(file);

    if (language === "en") {
      setEnFile(file);
      setEnEncoding(result.encoding);
      setEnText(result.text);
    } else {
      setFaFile(file);
      setFaEncoding(result.encoding);
      setFaText(result.text);
    }
  };

  const onEncodingChange = async (language, encoding) => {
    if (language === "en") {
      setEnEncoding(encoding);

      if (enFile) {
        setEnText(await decodeFile(enFile, encoding));
      }
    } else {
      setFaEncoding(encoding);

      if (faFile) {
        setFaText(await decodeFile(faFile, encoding));
      }
    }
  };

  const applySubtitles = useCallback(() => {
    const englishCues = parseSubtitleText(enText);
    const persianCues = parseSubtitleText(faText);

    const merged = mergeCues(englishCues, persianCues);

    setCues(merged);
    setCurrentIndex(-1);
    currentIndexRef.current = -1;
  }, [enText, faText]);

  const playVideo = async () => {
    const video = videoRef.current;
    if (!video) return;

    try {
      await video.play();
      setIsPlaying(true);
    } catch {
      setIsPlaying(false);
    }
  };

  const pauseVideo = () => {
    const video = videoRef.current;
    if (!video) return;

    video.pause();
    setIsPlaying(false);
  };

  const playPause = () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      playVideo();
    } else {
      pauseVideo();
    }
  };

  const jumpTo = (index, autoplay = true) => {
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
  };

  const replaySentence = () => {
    if (currentIndexRef.current === -1) return;

    jumpTo(currentIndexRef.current, true);
  };

  const nextSentence = () => {
    const nextIndex = currentIndexRef.current + 1;

    if (nextIndex < cuesRef.current.length) {
      jumpTo(nextIndex, true);
    }
  };

  const previousSentence = () => {
    const previousIndex = currentIndexRef.current - 1;

    if (previousIndex >= 0) {
      jumpTo(previousIndex, true);
    }
  };

  const onTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;

    const time = video.currentTime;
    setCurrent(time);

    if (seekingRef.current) return;
    if (userSeekingRef.current) return;

    const list = cuesRef.current;
    const lockedIndex = currentIndexRef.current;

    if (
      repeatRef.current &&
      lockedIndex !== -1 &&
      list[lockedIndex]
    ) {
      const currentCue = list[lockedIndex];
      const nextCue = list[lockedIndex + 1];

      const repeatBoundary = nextCue
        ? nextCue.start
        : currentCue.end;

      if (
        time >= repeatBoundary - 0.04 &&
        time >= currentCue.start - 0.1
      ) {
        const wasPlaying = !video.paused;

        seekingRef.current = true;
        playAfterSeekRef.current = wasPlaying;

        video.currentTime = currentCue.start;
      }

      return;
    }

    let detectedIndex = -1;

    for (let i = 0; i < list.length; i++) {
      const cue = list[i];

      if (time >= cue.start && time < cue.end) {
        detectedIndex = i;
        break;
      }
    }

    if (
      detectedIndex !== -1 &&
      detectedIndex !== currentIndexRef.current
    ) {
      currentIndexRef.current = detectedIndex;
      setCurrentIndex(detectedIndex);
    }
  };

  const onSeeked = () => {
    const video = videoRef.current;
    if (!video || !seekingRef.current) return;

    seekingRef.current = false;

    if (playAfterSeekRef.current) {
      playAfterSeekRef.current = false;
      playVideo();
    } else {
      playAfterSeekRef.current = false;
    }
  };

  const onProgressMouseDown = () => {
    userSeekingRef.current = true;
    seekingRef.current = false;
    playAfterSeekRef.current = false;
  };

  const onProgressChange = (event) => {
    setCurrent(Number(event.target.value));
  };

  const onProgressMouseUp = (event) => {
    const video = videoRef.current;
    if (!video) return;

    const newTime = Number(event.target.value);

    seekingRef.current = true;
    playAfterSeekRef.current = !video.paused;

    video.currentTime = newTime;

    setTimeout(() => {
      userSeekingRef.current = false;
    }, 150);
  };

  useEffect(() => {
    const video = videoRef.current;

    if (video) {
      video.playbackRate = rate;
    }
  }, [rate, videoUrl]);

  useEffect(() => {
    if (currentIndex === -1 || !stripRef.current) return;

    const element = stripRef.current.querySelector(
      `[data-frame="${currentIndex}"]`
    );

    if (element) {
      element.scrollIntoView({
        behavior: "smooth",
        inline: "center",
        block: "nearest",
      });
    }
  }, [currentIndex]);

  useEffect(() => {
    const handler = (event) => {
      const tagName = document.activeElement?.tagName;

      if (tagName === "TEXTAREA" || tagName === "INPUT") {
        return;
      }

      if (!videoRef.current) return;

      if (event.code === "Space") {
        event.preventDefault();
        playPause();
      }

      /*
       * جهت فلش‌ها به‌صورت کامل جابه‌جا شده است:
       * فلش چپ = جمله بعدی
       * فلش راست = جمله قبلی
       */
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
    };

    window.addEventListener("keydown", handler);

    return () => {
      window.removeEventListener("keydown", handler);
    };
  });

  const handleWordClick = async (rawWord) => {
    const word = rawWord.replace(/[^A-Za-z'-]/g, "");

    if (!word) return;

    const key = word.toLowerCase();

    if (translationCache.current[key]) {
      setWordPopup({
        word,
        translation: translationCache.current[key],
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
        "ترجمه یافت نشد";

      translationCache.current[key] = translation;

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

  const renderClickableEnglish = (text, prefix) => {
    return text.split(/(\s+)/).map((token, index) => {
      if (/^\s+$/.test(token) || !token) {
        return token;
      }

      return (
        <span
          key={`${prefix}-${index}`}
          onClick={(event) => {
            event.stopPropagation();
            handleWordClick(token);
          }}
          style={{
            cursor: "pointer",
            borderBottom: "1px dotted rgba(242,201,76,0.55)",
          }}
        >
          {token}
        </span>
      );
    });
  };

  const activeCue =
    currentIndex !== -1 ? cues[currentIndex] : null;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.bg,
        color: C.text,
        fontFamily: "'Vazirmatn', Tahoma, sans-serif",
      }}
    >
      <style>{`
        input[type="range"] {
          -webkit-appearance: none;
          appearance: none;
          background: transparent;
        }

        input[type="range"]::-webkit-slider-runnable-track {
          height: 4px;
          background: ${C.border};
          border-radius: 2px;
        }

        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 13px;
          height: 13px;
          margin-top: -4.5px;
          border-radius: 50%;
          background: ${C.yellow};
          cursor: pointer;
        }

        .frame-card:hover {
          border-color: ${C.yellow} !important;
        }

        ::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }

        ::-webkit-scrollbar-thumb {
          background: ${C.border};
          border-radius: 4px;
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
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Film size={27} color={C.yellow} />

          <div>
            <div
              style={{
                fontSize: 26,
                fontWeight: 800,
              }}
            >
              فیلم پلاس
            </div>

            <div
              style={{
                fontSize: 12,
                color: C.muted,
              }}
            >
              تمرین زبان با فیلم؛ جمله به جمله، تکرار به تکرار
            </div>
          </div>
        </div>

        <button
          onClick={() => setPanelOpen((value) => !value)}
          style={buttonStyle()}
        >
          <Upload size={15} />
          فایل‌ها
          {panelOpen ? (
            <ChevronUp size={15} />
          ) : (
            <ChevronDown size={15} />
          )}
        </button>
      </header>

      {panelOpen && (
        <section
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 16,
            padding: "16px 20px",
            background: C.panel,
            borderBottom: `1px solid ${C.border}`,
          }}
        >
          <div>
            <label style={labelStyle()}>
              <Upload size={15} color={C.yellow} />
              {videoName || "انتخاب فایل ویدیو"}

              <input
                type="file"
                accept="video/*"
                onChange={onVideoFile}
                style={{ display: "none" }}
              />
            </label>
          </div>

          <SubtitleUploader
            title="زیرنویس انگلیسی"
            language="en"
            file={enFile}
            encoding={enEncoding}
            text={enText}
            setText={setEnText}
            onFile={onSubtitleFile}
            onEncoding={onEncodingChange}
            color={C.yellow}
          />

          <SubtitleUploader
            title="زیرنویس فارسی"
            language="fa"
            file={faFile}
            encoding={faEncoding}
            text={faText}
            setText={setFaText}
            onFile={onSubtitleFile}
            onEncoding={onEncodingChange}
            color={C.teal}
          />

          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button
              onClick={applySubtitles}
              style={{
                width: "100%",
                padding: "11px 14px",
                border: "none",
                borderRadius: 8,
                background: C.yellow,
                color: "#1a1a1a",
                fontFamily: "inherit",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              اعمال زیرنویس‌ها ({enCueCount} / {faCueCount})
            </button>
          </div>
        </section>
      )}

      {!videoUrl ? (
        <div
          style={{
            padding: 60,
            textAlign: "center",
            color: C.muted,
          }}
        >
          برای شروع، یک فایل ویدیویی انتخاب کنید.
        </div>
      ) : (
        <main
          style={{
            maxWidth: 980,
            margin: "0 auto",
            padding: 20,
          }}
        >
          <div
            style={{
              position: "relative",
              overflow: "hidden",
              background: "#000",
              border: `1px solid ${C.border}`,
              borderRadius: 12,
            }}
          >
            <video
              ref={videoRef}
              src={videoUrl}
              onTimeUpdate={onTimeUpdate}
              onSeeked={onSeeked}
              onLoadedMetadata={(event) =>
                setDuration(event.target.duration)
              }
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              style={{
                display: "block",
                width: "100%",
                maxHeight: "56vh",
                background: "#000",
              }}
            />

            {wordPopup && (
              <div
                style={{
                  position: "absolute",
                  top: 10,
                  left: 10,
                  zIndex: 5,
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  maxWidth: "80%",
                  padding: "8px 12px",
                  background: "rgba(10,11,16,.92)",
                  border: `1px solid ${C.teal}`,
                  borderRadius: 8,
                }}
              >
                <div>
                  <div
                    style={{
                      color: C.yellow,
                      fontSize: 13,
                      fontWeight: 700,
                    }}
                  >
                    {wordPopup.word}
                  </div>

                  <div
                    dir="rtl"
                    style={{
                      marginTop: 2,
                      color: C.teal,
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
                    padding: 0,
                    border: "none",
                    background: "transparent",
                    color: C.muted,
                    cursor: "pointer",
                  }}
                >
                  <X size={14} />
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
                {showEn && activeCue.en && (
                  <div
                    style={{
                      maxWidth: "90%",
                      padding: "4px 12px",
                      background: "rgba(0,0,0,.72)",
                      borderRadius: 6,
                      color: C.yellow,
                      fontSize: 17,
                      fontWeight: 600,
                      textAlign: "center",
                    }}
                  >
                    {renderClickableEnglish(activeCue.en, "overlay")}
                  </div>
                )}

                {showFa && activeCue.fa && (
                  <div
                    dir="rtl"
                    style={{
                      maxWidth: "90%",
                      padding: "4px 12px",
                      background: "rgba(0,0,0,.72)",
                      borderRadius: 6,
                      color: C.teal,
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
            min={0}
            max={duration || 0}
            step={0.01}
            value={current}
            onMouseDown={onProgressMouseDown}
            onMouseUp={onProgressMouseUp}
            onTouchStart={onProgressMouseDown}
            onTouchEnd={onProgressMouseUp}
            onChange={onProgressChange}
            style={{
              width: "100%",
              marginTop: 12,
            }}
          />

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: -4,
              color: C.muted,
              fontSize: 11,
            }}
          >
            <span>{formatTime(current)}</span>
            <span>{formatTime(duration)}</span>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              flexWrap: "wrap",
              marginTop: 14,
            }}
          >
            {/*
              چیدمان و عملکرد دکمه‌ها نیز کاملاً جابه‌جا شده است:

              سمت چپ:
              فلش چپ = جمله بعدی

              سمت راست:
              فلش راست = جمله قبلی
            */}

            <IconButton
              onClick={nextSentence}
              title="جمله بعدی"
            >
              <SkipBack size={18} />
            </IconButton>

            <IconButton
              onClick={playPause}
              big
              title="پخش / توقف"
            >
              {isPlaying ? (
                <Pause size={22} />
              ) : (
                <Play size={22} />
              )}
            </IconButton>

            <IconButton
              onClick={previousSentence}
              title="جمله قبلی"
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
                  repeatOn ? C.yellow : C.border
                }`,
                borderRadius: 20,
                background: repeatOn
                  ? "rgba(242,201,76,.15)"
                  : C.card,
                color: repeatOn ? C.yellow : C.text,
                fontFamily: "inherit",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {repeatOn ? <Repeat1 size={18} /> : <Repeat size={18} />}
              تکرار جمله: {repeatOn ? "فعال" : "غیرفعال"}
            </button>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                border: `1px solid ${C.border}`,
                borderRadius: 20,
                background: C.card,
              }}
            >
              <Gauge size={15} color={C.muted} />

              <select
                value={rate}
                onChange={(event) =>
                  setRate(Number(event.target.value))
                }
                style={{
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  color: C.text,
                  fontFamily: "inherit",
                }}
              >
                {[0.5, 0.75, 1, 1.25, 1.5].map((value) => (
                  <option
                    key={value}
                    value={value}
                    style={{ background: C.card }}
                  >
                    {value}x
                  </option>
                ))}
              </select>
            </div>

            <ToggleChip
              label="EN"
              active={showEn}
              color={C.yellow}
              onClick={() => setShowEn((value) => !value)}
            />

            <ToggleChip
              label="FA"
              active={showFa}
              color={C.teal}
              onClick={() => setShowFa((value) => !value)}
            />
          </div>

          {cues.length > 0 && (
            <section style={{ marginTop: 24 }}>
              <div
                style={{
                  marginBottom: 8,
                  color: C.muted,
                  fontSize: 12,
                }}
              >
                نماها ({cues.length}) — برای پخش روی کارت کلیک کنید
              </div>

              <div
                ref={stripRef}
                style={{
                  display: "flex",
                  gap: 10,
                  overflowX: "auto",
                  paddingBottom: 10,
                }}
              >
                {cues.map((cue, index) => (
                  <div
                    key={index}
                    data-frame={index}
                    className="frame-card"
                    onClick={() => jumpTo(index, true)}
                    style={{
                      minWidth: 210,
                      maxWidth: 210,
                      flexShrink: 0,
                      padding: "8px 10px",
                      border: `1px solid ${
                        index === currentIndex
                          ? C.yellow
                          : C.border
                      }`,
                      borderRadius: 10,
                      background:
                        index === currentIndex
                          ? C.cardActive
                          : C.card,
                      cursor: "pointer",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: 6,
                        color: C.muted,
                        fontSize: 10,
                      }}
                    >
                      <span>
                        نما {String(cue.index).padStart(2, "0")}
                      </span>
                      <span>{formatTime(cue.start)}</span>
                    </div>

                    {cue.en && (
                      <div
                        style={{
                          marginBottom: 4,
                          color: C.yellow,
                          fontSize: 12.5,
                          lineHeight: 1.4,
                        }}
                      >
                        {renderClickableEnglish(
                          cue.en,
                          `strip-${index}`
                        )}
                      </div>
                    )}

                    {cue.fa && (
                      <div
                        dir="rtl"
                        style={{
                          color: C.teal,
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

function SubtitleUploader({
  title,
  language,
  file,
  encoding,
  text,
  setText,
  onFile,
  onEncoding,
  color,
}) {
  return (
    <div>
      <div
        style={{
          marginBottom: 6,
          color: C.muted,
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
          border: `1px dashed ${C.border}`,
          borderRadius: 8,
          background: C.card,
          color: C.text,
          fontSize: 12.5,
          cursor: "pointer",
        }}
      >
        <Upload size={14} color={color} />
        {file ? file.name : `بارگذاری فایل ${language.toUpperCase()}`}

        <input
          type="file"
          accept=".srt,.vtt,text/plain"
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
          onEncoding(language, event.target.value)
        }
        style={{
          width: "100%",
          marginBottom: 6,
          padding: 6,
          border: `1px solid ${C.border}`,
          borderRadius: 6,
          background: C.card,
          color: C.text,
          fontFamily: "inherit",
          fontSize: 11.5,
        }}
      >
        {ENCODINGS.map((item) => (
          <option
            key={item.value}
            value={item.value}
            style={{ background: C.card }}
          >
            {item.label}
          </option>
        ))}
      </select>

      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="متن زیرنویس را اینجا وارد کنید..."
        dir={language === "fa" ? "rtl" : "ltr"}
        style={{
          width: "100%",
          height: 65,
          boxSizing: "border-box",
          padding: 8,
          resize: "vertical",
          border: `1px solid ${C.border}`,
          borderRadius: 8,
          outline: "none",
          background: C.card,
          color: C.text,
          fontFamily:
            language === "en" ? "monospace" : "inherit",
          fontSize: 12,
        }}
      />
    </div>
  );
}

function buttonStyle() {
  return {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 12px",
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    background: C.card,
    color: C.text,
    fontFamily: "inherit",
    fontSize: 13,
    cursor: "pointer",
  };
}

function labelStyle() {
  return {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 12px",
    border: `1px dashed ${C.border}`,
    borderRadius: 8,
    background: C.card,
    color: C.text,
    fontSize: 13,
    cursor: "pointer",
  };
}

function IconButton({ children, onClick, title, big = false }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: big ? 52 : 40,
        height: big ? 52 : 40,
        border: `1px solid ${C.border}`,
        borderRadius: "50%",
        background: C.card,
        color: C.text,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function ToggleChip({ label, active, color, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 14px",
        border: `1px solid ${active ? color : C.border}`,
        borderRadius: 20,
        background: active ? `${color}22` : C.card,
        color: active ? color : C.muted,
        fontSize: 12,
        fontWeight: 700,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}
