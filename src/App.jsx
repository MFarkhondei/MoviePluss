import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  ChevronLeft,
  ChevronRight,
  Film,
  Maximize,
  Minimize,
  PanelBottom,
  PanelRight,
  Pause,
  Play,
  Settings,
  Subtitles,
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
      const timeIndex = lines.findIndex((line) => line.includes("-->"));

      if (timeIndex === -1) return null;

      const times = lines[timeIndex].split("-->");
      const start = timeToSeconds(times[0]);
      const end = timeToSeconds(times[1]?.trim().split(/\s+/)[0]);

      const text = lines
        .slice(timeIndex + 1)
        .join(" ")
        .replace(/<[^>]+>/g, "")
        .trim();

      if (!text) return null;

      return { start, end, text };
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
    return { text: decodeBuffer(buffer, "windows-1256"), encoding: "windows-1256" };
  }

  return { text: utf8, encoding: "utf-8" };
}

async function decodeFile(file, encoding) {
  const buffer = await file.arrayBuffer();
  return decodeBuffer(buffer, encoding);
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
    fontFamily: "'Vazirmatn', sans-serif",
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
    fontFamily: "'Vazirmatn', sans-serif",
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
    fontFamily: "'Vazirmatn', sans-serif",
  };
}

function SettingRange({ label, value, min, max, onChange }) {
  return (
    <label
      style={{
        display: "block",
        marginBottom: 12,
        color: COLORS.text,
        fontSize: 11,
        fontFamily: "'Vazirmatn', sans-serif",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
        <span>{label}</span>
        <span style={{ color: COLORS.muted }}>{value}</span>
      </div>

      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function SubtitleInput({ language, file, encoding, color, onFile, onEncoding }) {
  const label = language === "en" ? "زیرنویس انگلیسی" : "زیرنویس فارسی";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          padding: "8px 10px",
          border: `1px dashed ${COLORS.border}`,
          borderRadius: 8,
          background: COLORS.card,
          color: COLORS.text,
          fontSize: 11,
          cursor: "pointer",
          fontFamily: "'Vazirmatn', sans-serif",
          minHeight: 42,
        }}
      >
        <Subtitles size={15} color={color} />
        <span style={{ flex: 1 }}>{file?.name || label}</span>

        <input
          type="file"
          accept=".srt,.vtt,.txt"
          onChange={(event) => onFile(event.target.files?.[0], language)}
          style={{ display: "none" }}
        />
      </label>

      <select
        value={encoding}
        onChange={(event) => onEncoding(language, event.target.value)}
        style={selectStyle(true)}
      >
        {ENCODINGS.map((item) => (
          <option
            key={item.value}
            value={item.value}
            style={{ background: COLORS.card, fontFamily: "'Vazirmatn', sans-serif" }}
          >
            {item.label}
          </option>
        ))}
      </select>
    </div>
  );
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

  const [englishEncoding, setEnglishEncoding] = useState("utf-8");
  const [persianEncoding, setPersianEncoding] = useState("utf-8");

  const [cues, setCues] = useState([]);
  const [currentCue, setCurrentCue] = useState(-1);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [playbackRate, setPlaybackRate] = useState(1);

  const [repeatOn, setRepeatOn] = useState(false);

  // ✅ پیش‌فرض: هر دو خاموش
  const [showEnglish, setShowEnglish] = useState(false);
  const [showPersian, setShowPersian] = useState(false);

  const [filesOpen, setFilesOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [cardsLayout, setCardsLayout] = useState("horizontal"); // "horizontal" | "vertical"

  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [subtitleSize, setSubtitleSize] = useState(100);
  const [subtitleBottom, setSubtitleBottom] = useState(70);
  const [subtitleBackground, setSubtitleBackground] = useState(true);

  const [wordPopup, setWordPopup] = useState(null);

  const [translationPosition, setTranslationPosition] = useState({
    top: 18,
    right: 18,
    left: null,
  });

  const activeCue = currentCue >= 0 ? cues[currentCue] : null;

  useEffect(() => { cuesRef.current = cues; }, [cues]);
  useEffect(() => { currentCueRef.current = currentCue; }, [currentCue]);
  useEffect(() => { repeatRef.current = repeatOn; }, [repeatOn]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = playbackRate;
  }, [playbackRate]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === playerRef.current);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    if (currentCue < 0 || !cardsRef.current) return;

    const scrollContainer = cardsRef.current.querySelector(".cards-container");
    if (!scrollContainer) return;

    const cardElement = scrollContainer.querySelector(`[data-card="${currentCue}"]`);
    if (!cardElement) return;

    const isVertical = cardsLayout === "vertical";

    if (isVertical) {
      const targetTop =
        cardElement.offsetTop -
        scrollContainer.clientHeight / 2 +
        cardElement.offsetHeight / 2;

      scrollContainer.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
    } else {
      const targetLeft =
        cardElement.offsetLeft -
        scrollContainer.clientWidth / 2 +
        cardElement.offsetWidth / 2;

      scrollContainer.scrollTo({ left: Math.max(0, targetLeft), behavior: "smooth" });
    }
  }, [currentCue, cardsLayout]);

  useEffect(() => {
    return () => { if (videoUrl) URL.revokeObjectURL(videoUrl); };
  }, [videoUrl]);

  const showControlsTemporarily = useCallback(() => {
    setControlsVisible(true);
    clearTimeout(hideControlsTimerRef.current);

    if (isPlaying) {
      hideControlsTimerRef.current = setTimeout(() => setControlsVisible(false), 3500);
    }
  }, [isPlaying]);

  const handleMouseEnterPlayer = useCallback(() => {
    setControlsVisible(true);
    clearTimeout(hideControlsTimerRef.current);
  }, []);

  const handleMouseLeavePlayer = useCallback(() => {
    setControlsVisible(false);
    clearTimeout(hideControlsTimerRef.current);
  }, []);

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
    if (videoRef.current.paused) playVideo();
    else pauseVideo();
  }, [playVideo, pauseVideo]);

  const seekBy = useCallback((seconds) => {
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
  }, [duration, showControlsTemporarily]);

  const seekTo = (value) => {
    if (!videoRef.current) return;
    const nextTime = Number(value);
    videoRef.current.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  const jumpToCue = useCallback((index, autoplay = true) => {
    const cue = cuesRef.current[index];
    if (!cue || !videoRef.current) return;

    currentCueRef.current = index;
    setCurrentCue(index);
    setWordPopup(null);

    videoRef.current.currentTime = cue.start;
    if (autoplay) playVideo();
  }, [playVideo]);

  const goToPreviousCard = useCallback(() => {
    const previousIndex = currentCueRef.current - 1;
    if (previousIndex >= 0) jumpToCue(previousIndex, true);
    else if (videoRef.current) {
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

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;

    const time = videoRef.current.currentTime;
    setCurrentTime(time);

    const list = cuesRef.current;
    const index = currentCueRef.current;

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

    if (detectedIndex !== -1 && detectedIndex !== currentCueRef.current) {
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
    if (videoUrl) URL.revokeObjectURL(videoUrl);

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

  const changeSubtitleEncoding = async (language, encoding) => {
    if (language === "en") {
      setEnglishEncoding(encoding);
      if (englishFile) setEnglishText(await decodeFile(englishFile, encoding));
    } else {
      setPersianEncoding(encoding);
      if (persianFile) setPersianText(await decodeFile(persianFile, encoding));
    }
  };

  const applySubtitles = () => {
    const merged = mergeSubtitles(englishText, persianText);
    setCues(merged);
    cuesRef.current = merged;
    setCurrentCue(-1);
    currentCueRef.current = -1;
  };

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await playerRef.current?.requestFullscreen();
    } catch (error) {
      console.error(error);
    }
  };

  // ترجمه
  const translateWord = async (rawWord) => {
    const word = rawWord.replace(/[^A-Za-z'-]/g, "").trim();
    if (!word) return;

    const key = word.toLowerCase();

    if (translationCacheRef.current[key]) {
      setWordPopup({ word, translation: translationCacheRef.current[key], loading: false });
      return;
    }

    setWordPopup({ word, translation: "", loading: true });

    try {
      const response = await fetch(
        `https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=en|fa`
      );
      const data = await response.json();

      const translation = data?.responseData?.translatedText || "ترجمه پیدا نشد";
      translationCacheRef.current[key] = translation;

      setWordPopup({ word, translation, loading: false });
    } catch {
      setWordPopup({ word, translation: "خطا در دریافت ترجمه", loading: false });
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
          style={{ cursor: "pointer", borderBottom: `1px dotted ${COLORS.yellow}` }}
        >
          {token}
        </span>
      );
    });
  };

  const handleVideoContextMenu = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleVideoClick = () => togglePlay();

  // پاپ‌آپ ترجمه
  const handleTranslationPointerDown = (event) => {
    if (!translationRef.current || !playerRef.current) return;

    event.preventDefault();
    event.stopPropagation();

    const popupRect = translationRef.current.getBoundingClientRect();
    translationDragRef.current = {
      active: true,
      offsetX: event.clientX - popupRect.left,
      offsetY: event.clientY - popupRect.top,
    };
  };

  const handleTranslationPointerMove = useCallback((event) => {
    if (!translationDragRef.current?.active) return;
    if (!translationRef.current || !playerRef.current) return;

    const playerRect = playerRef.current.getBoundingClientRect();
    const popupRect = translationRef.current.getBoundingClientRect();

    let left = event.clientX - playerRect.left - translationDragRef.current.offsetX;
    let top = event.clientY - playerRect.top - translationDragRef.current.offsetY;

    left = Math.max(8, Math.min(left, playerRect.width - popupRect.width - 8));
    top = Math.max(8, Math.min(top, playerRect.height - popupRect.height - 8));

    setTranslationPosition({ top, left, right: null });
  }, []);

  const handleTranslationPointerUp = useCallback(() => {
    if (translationDragRef.current) translationDragRef.current.active = false;
  }, []);

  useEffect(() => {
    window.addEventListener("pointermove", handleTranslationPointerMove);
    window.addEventListener("pointerup", handleTranslationPointerUp);
    return () => {
      window.removeEventListener("pointermove", handleTranslationPointerMove);
      window.removeEventListener("pointerup", handleTranslationPointerUp);
    };
  }, [handleTranslationPointerMove, handleTranslationPointerUp]);

  // موبایل
  const touchRef = useRef({
    startX: 0,
    startY: 0,
    holdTimer: null,
    boosted: false,
    swiped: false,
  });

  const handleTouchStart = (event) => {
    const touch = event.touches[0];
    touchRef.current.startX = touch.clientX;
    touchRef.current.startY = touch.clientY;
    touchRef.current.boosted = false;
    touchRef.current.swiped = false;

    clearTimeout(touchRef.current.holdTimer);
    touchRef.current.holdTimer = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) {
        touchRef.current.boosted = true;
        videoRef.current.playbackRate = playbackRate * 2;
      }
    }, 350);
  };

  const handleTouchMove = (event) => {
    const touch = event.touches[0];
    const dx = touch.clientX - touchRef.current.startX;
    const dy = touch.clientY - touchRef.current.startY;

    if (Math.abs(dx) > 12 || Math.abs(dy) > 12) {
      clearTimeout(touchRef.current.holdTimer);
    }
  };

  const handleTouchEnd = (event) => {
    clearTimeout(touchRef.current.holdTimer);

    if (touchRef.current.boosted && videoRef.current) {
      videoRef.current.playbackRate = playbackRate;
      touchRef.current.boosted = false;
      touchRef.current.swiped = true;
      return;
    }

    const touch = event.changedTouches[0];
    const dx = touch.clientX - touchRef.current.startX;
    const dy = touch.clientY - touchRef.current.startY;

    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      touchRef.current.swiped = true;
      if (dx > 0) goToNextCard();
      else goToPreviousCard();
    }
  };

  // کیبورد
  useEffect(() => {
    const handleKeyboard = (event) => {
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (event.code === "Space") {
        event.preventDefault();
        togglePlay();
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        goToNextCard();
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goToPreviousCard();
      }
      if (event.key === "j") seekBy(-10);
      if (event.key === "l") seekBy(10);
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
          return SPEEDS[Math.min(SPEEDS.length - 1, index + 1)];
        });
      }

      showControlsTemporarily();
    };

    window.addEventListener("keydown", handleKeyboard);
    return () => window.removeEventListener("keydown", handleKeyboard);
  }, [goToNextCard, goToPreviousCard, seekBy, showControlsTemporarily, toggleFullscreen, togglePlay]);

  return (
    <div dir="rtl" className="movie-pluss" style={{ fontFamily: "Vazirmatn, sans-serif" }}>
      <style>{`
        * { box-sizing: border-box; }
        body {
          margin: 0;
          background: ${COLORS.bg};
          overflow-x: hidden;
          font-family: 'Vazirmatn', sans-serif;
        }
        button, input, textarea, select { font-family: 'Vazirmatn', sans-serif; }

        .movie-player {
          position: relative;
          overflow: hidden;
          border: 1px solid ${COLORS.border};
          border-radius: 14px;
          background: #000;
          width: 100%;
          display: flex;
          flex-direction: column;
          min-height: 520px;
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

        .video-stage { position: relative; width: 100%; background: #000; flex: 0 0 auto; }
        .video-stage video {
          display: block;
          width: 100%;
          min-height: 360px;
          max-height: 70vh;
          background: #000;
          object-fit: contain;
          touch-action: pan-y;
        }

        .cards-section {
          background: ${COLORS.panel};
          font-family: 'Vazirmatn', sans-serif;
          flex: 1 1 auto;
          min-height: 0;
          border-top: 1px solid ${COLORS.border};
          display: flex;
          flex-direction: column;
        }

        .cards-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          color: ${COLORS.muted};
          font-size: 12px;
          padding: 12px 14px 10px;
          border-bottom: 1px solid rgba(255,255,255,0.04);
          flex: 0 0 auto;
        }

        .cards-layout-toggle { display: flex; gap: 4px; }
        .cards-layout-toggle button {
          display: flex; align-items: center; justify-content: center;
          width: 26px; height: 26px;
          border: 1px solid ${COLORS.border};
          border-radius: 6px;
          background: rgba(0,0,0,.3);
          color: ${COLORS.muted};
          cursor: pointer;
        }
        .cards-layout-toggle button.active {
          border-color: ${COLORS.yellow};
          color: ${COLORS.yellow};
          background: rgba(242,201,76,.15);
        }

        .cards-container {
          flex: 1 1 auto;
          min-height: 0;
          display: flex;
          gap: 10px;
          padding: 12px 14px 14px;
          overflow: auto;
          direction: ltr;
          scroll-behavior: smooth;
        }

        .cards-container::-webkit-scrollbar { height: 6px; width: 6px; }
        .cards-container::-webkit-scrollbar-track { background: ${COLORS.bg}; border-radius: 3px; }
        .cards-container::-webkit-scrollbar-thumb { background: ${COLORS.border}; border-radius: 3px; }
        .cards-container::-webkit-scrollbar-thumb:hover { background: ${COLORS.muted}; }

        .cards-section-horizontal .cards-container { flex-direction: row; overflow-x: auto; overflow-y: hidden; }
        .cards-section-horizontal .subtitle-card { min-width: 230px; max-width: 230px; flex-shrink: 0; padding: 11px; }

        .cards-section-vertical .cards-container { flex-direction: column; overflow-y: auto; overflow-x: hidden; direction: rtl; }
        .cards-section-vertical .subtitle-card { width: 100%; padding: 11px; }

        .subtitle-card:hover { border-color: ${COLORS.yellow} !important; }

        .bottom-quickbar {
          position: relative;
          z-index: 60;
          padding: 10px 14px 14px;
          background: linear-gradient(
            rgba(13,15,21,0),
            rgba(13,15,21,.55) 25%,
            rgba(13,15,21,.98)
          );
          border-top: 1px solid rgba(255,255,255,0.06);
        }

        .bottom-quickbar-inner {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 10px;
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 16px;
          background: rgba(10,12,18,.62);
          backdrop-filter: blur(8px);
          padding: 10px 12px;
        }

        .quick-btn {
          display: flex; align-items: center; justify-content: center;
          width: 44px; height: 44px;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(0,0,0,.25);
          color: ${COLORS.text};
          cursor: pointer;
        }
        .quick-btn:active { transform: scale(0.98); }

        .quick-btn.play {
          width: 56px; height: 50px;
          border-radius: 14px;
          background: rgba(242,201,76,.16);
          border-color: rgba(242,201,76,.35);
          color: ${COLORS.yellow};
        }

        .player-controls.hidden { opacity: 0; pointer-events: none; }

        .translation-popup {
          position: absolute;
          z-index: 100;
          width: min(310px, calc(100% - 32px));
          user-select: none;
          touch-action: none;
        }
        .translation-handle { cursor: grab; touch-action: none; }
        .translation-handle:active { cursor: grabbing; }

        .settings-popup {
          position: absolute;
          top: 14px;
          left: 14px;
          z-index: 90;
          width: 260px;
          padding: 14px;
          border: 1px solid ${COLORS.border};
          border-radius: 10px;
          background: rgba(20,23,31,.97);
          fontFamily: "'Vazirmatn', sans-serif";
        }

        .settings-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 10px;
          padding-bottom: 10px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }

        .upload-section {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr auto;
          gap: 14px;
          padding: 20px;
          background: ${COLORS.panel};
          border-bottom: 1px solid ${COLORS.border};
          align-items: stretch;
        }
        .upload-section > * { min-height: 42px; }
        .upload-section .apply-btn {
          align-self: stretch;
          min-height: 100%;
          border: none;
          border-radius: 8px;
          background: ${COLORS.yellow};
          color: #171717;
          font-weight: 800;
          cursor: pointer;
          font-family: 'Vazirmatn', sans-serif;
          font-size: 14px;
          padding: 0 20px;
          transition: all 0.2s ease;
          letter-spacing: 0.5px;
        }
        .upload-section .apply-btn:hover {
          transform: scale(1.02);
          box-shadow: 0 4px 15px rgba(242, 201, 76, 0.3);
        }
        .upload-section .apply-btn:active { transform: scale(0.98); }

        @media (max-width: 767px) {
          .movie-player { min-height: 460px; }
          .upload-section { grid-template-columns: 1fr !important; }
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
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Film size={28} color={COLORS.yellow} />
          <div>
            <div style={{ fontSize: 23, fontWeight: 900 }}>فیلم پلاس</div>
            <div style={{ color: COLORS.muted, fontSize: 11 }}>پلیر حرفه‌ای تمرین زبان با فیلم</div>
          </div>
        </div>

        <button onClick={() => setFilesOpen((v) => !v)} style={buttonStyle()}>
          فایل‌ها
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, color: COLORS.muted }}>
            <span style={{ fontWeight: 900, color: COLORS.yellow }}>
              {filesOpen ? "<" : ">"}
            </span>
          </span>
        </button>
      </header>

      {filesOpen && (
        <section className="upload-section">
          <label style={uploadBoxStyle()}>
            <Film size={18} color={COLORS.yellow} />
            {videoName || "انتخاب فایل ویدیو"}
            <input
              type="file"
              accept="video/*"
              onChange={(event) => handleVideoFile(event.target.files?.[0])}
              style={{ display: "none" }}
            />
          </label>

          <SubtitleInput
            language="en"
            file={englishFile}
            encoding={englishEncoding}
            color={COLORS.yellow}
            onFile={handleSubtitleFile}
            onEncoding={changeSubtitleEncoding}
          />

          <SubtitleInput
            language="fa"
            file={persianFile}
            encoding={persianEncoding}
            color={COLORS.teal}
            onFile={handleSubtitleFile}
            onEncoding={changeSubtitleEncoding}
          />

          <button onClick={applySubtitles} className="apply-btn">
            اعمال زیرنویس‌ها
          </button>
        </section>
      )}

      <main style={{ maxWidth: 1100, margin: "0 auto", padding: 20 }}>
        <div
          ref={playerRef}
          className="movie-player"
          onMouseEnter={handleMouseEnterPlayer}
          onMouseLeave={handleMouseLeavePlayer}
          onMouseMove={showControlsTemporarily}
          style={{ minHeight: videoUrl ? 360 + 180 : 270 }}
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
                fontFamily: "'Vazirmatn', sans-serif",
              }}
            >
              <Play size={50} color={COLORS.yellow} />
              برای انتخاب فیلم کلیک کنید

              <input
                type="file"
                accept="video/*"
                onChange={(event) => handleVideoFile(event.target.files?.[0])}
                style={{ display: "none" }}
              />
            </label>
          ) : (
            <>
              <div className="video-stage">
                <video
                  ref={videoRef}
                  src={videoUrl}
                  onLoadedMetadata={handleVideoLoaded}
                  onTimeUpdate={handleTimeUpdate}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onDoubleClick={toggleFullscreen}
                  onClick={handleVideoClick}
                  onContextMenu={handleVideoContextMenu}
                  onTouchStart={handleTouchStart}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                  style={{ filter: `brightness(${brightness}%) contrast(${contrast}%)` }}
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
                        boxShadow: "0 10px 35px rgba(0,0,0,.5)",
                        fontFamily: "'Vazirmatn', sans-serif",
                      }}
                    >
                      <div
                        className="translation-handle"
                        onPointerDown={handleTranslationPointerDown}
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
                          onPointerDown={(event) => event.stopPropagation()}
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

                      <div style={{ padding: 13, direction: "rtl" }}>
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

                        <div style={{ marginTop: 6, color: COLORS.teal, lineHeight: 1.8 }}>
                          {wordPopup.loading ? "در حال دریافت ترجمه..." : wordPopup.translation}
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
                          padding: subtitleBackground ? "5px 12px" : "2px 4px",
                          borderRadius: 6,
                          background: subtitleBackground ? "rgba(0,0,0,.78)" : "transparent",
                          color: COLORS.yellow,
                          fontSize: `${17 * (subtitleSize / 100)}px`,
                          fontWeight: 700,
                          textAlign: "center",
                          direction: "ltr",
                          pointerEvents: "auto",
                          fontFamily: "'Vazirmatn', sans-serif",
                        }}
                      >
                        {renderEnglish(activeCue.en, "overlay")}
                      </div>
                    )}

                    {showPersian && activeCue.fa && (
                      <div
                        style={{
                          maxWidth: "92%",
                          padding: subtitleBackground ? "5px 12px" : "2px 4px",
                          borderRadius: 6,
                          background: subtitleBackground ? "rgba(0,0,0,.78)" : "transparent",
                          color: COLORS.teal,
                          fontSize: `${17 * (subtitleSize / 100)}px`,
                          fontWeight: 700,
                          textAlign: "center",
                          fontFamily: "'Vazirmatn', sans-serif",
                        }}
                      >
                        {activeCue.fa}
                      </div>
                    )}
                  </div>
                )}

                <div
                  className={`player-controls ${controlsVisible ? "" : "hidden"}`}
                  style={{
                    position: "absolute",
                    right: 0,
                    left: 0,
                    bottom: 0,
                    padding: "70px 14px 14px",
                    background: "linear-gradient(transparent, rgba(0,0,0,.9))",
                  }}
                  onClick={(e) => e.stopPropagation()}
                  onContextMenu={(e) => e.stopPropagation()}
                >
                  <input
                    type="range"
                    min="0"
                    max={duration || 0}
                    step="0.01"
                    value={currentTime}
                    onChange={(event) => seekTo(event.target.value)}
                    style={{ direction: "ltr", accentColor: COLORS.yellow }}
                  />

                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
                    <span
                      style={{
                        color: COLORS.text,
                        fontSize: 11,
                        minWidth: 108,
                        direction: "ltr",
                        fontFamily: "'Vazirmatn', sans-serif",
                      }}
                    >
                      {formatTime(currentTime)} / {formatTime(duration)}
                    </span>

                    <div style={{ flex: 1 }} />

                    <button
                      onClick={() => setSettingsOpen((v) => !v)}
                      style={{
                        width: 38,
                        height: 36,
                        borderRadius: 10,
                        border: `1px solid ${COLORS.border}`,
                        background: "rgba(0,0,0,.25)",
                        color: COLORS.text,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                      title="تنظیمات"
                    >
                      <Settings size={18} />
                    </button>

                    <button
                      onClick={toggleFullscreen}
                      style={{
                        width: 38,
                        height: 36,
                        borderRadius: 10,
                        border: `1px solid ${COLORS.border}`,
                        background: "rgba(0,0,0,.25)",
                        color: COLORS.text,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                      title="تمام صفحه"
                    >
                      {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
                    </button>
                  </div>

                  {/* ✅ تنظیمات با بستن X + موارد جدید */}
                  {settingsOpen && (
                    <div
                      className="settings-popup"
                      onClick={(event) => event.stopPropagation()}
                      onContextMenu={(event) => event.stopPropagation()}
                    >
                      <div className="settings-header">
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <Settings size={16} color={COLORS.yellow} />
                          <span style={{ color: COLORS.text, fontSize: 12, fontWeight: 800 }}>
                            تنظیمات
                          </span>
                        </div>

                        <button
                          onClick={() => setSettingsOpen(false)}
                          style={{
                            width: 30,
                            height: 30,
                            borderRadius: 10,
                            border: `1px solid ${COLORS.border}`,
                            background: "rgba(0,0,0,.25)",
                            color: COLORS.text,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                          title="بستن"
                        >
                          <X size={16} />
                        </button>
                      </div>

                      <SettingRange label="روشنایی" value={brightness} min={50} max={150} onChange={setBrightness} />
                      <SettingRange label="کنتراست" value={contrast} min={50} max={150} onChange={setContrast} />
                      <SettingRange label="اندازه زیرنویس" value={subtitleSize} min={60} max={180} onChange={setSubtitleSize} />
                      <SettingRange label="موقعیت زیرنویس" value={subtitleBottom} min={5} max={180} onChange={setSubtitleBottom} />

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
                          onChange={(event) => setSubtitleBackground(event.target.checked)}
                        />
                      </label>

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
                        نمایش زیرنویس انگلیسی
                        <input
                          type="checkbox"
                          checked={showEnglish}
                          onChange={(event) => setShowEnglish(event.target.checked)}
                        />
                      </label>

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
                        نمایش زیرنویس فارسی
                        <input
                          type="checkbox"
                          checked={showPersian}
                          onChange={(event) => setShowPersian(event.target.checked)}
                        />
                      </label>

                      {/* ✅ گزینه تکرار در تنظیمات */}
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
                        تکرار یک جمله
                        <input
                          type="checkbox"
                          checked={repeatOn}
                          onChange={(event) => setRepeatOn(event.target.checked)}
                        />
                      </label>
                    </div>
                  )}
                </div>
              </div>

              {/* ✅ کارت‌ها */}
              {cues.length > 0 ? (
                <section ref={cardsRef} className={`cards-section cards-section-${cardsLayout}`}>
                  <div className="cards-header">
                    <span>کارت‌ها ({cues.length})</span>

                    <div className="cards-layout-toggle">
                      <button
                        type="button"
                        title="نمایش افقی زیر فیلم"
                        onClick={() => setCardsLayout("horizontal")}
                        className={cardsLayout === "horizontal" ? "active" : ""}
                      >
                        <PanelBottom size={14} />
                      </button>

                      <button
                        type="button"
                        title="نمایش عمودی کنار فیلم"
                        onClick={() => setCardsLayout("vertical")}
                        className={cardsLayout === "vertical" ? "active" : ""}
                      >
                        <PanelRight size={14} />
                      </button>
                    </div>

                    <span>کارت {currentCue >= 0 ? currentCue + 1 : "-"}</span>
                  </div>

                  <div className="cards-container">
                    {cues.map((cue, index) => (
                      <div
                        key={index}
                        data-card={index}
                        className="subtitle-card"
                        onClick={() => jumpToCue(index, true)}
                        style={{
                          border: `1px solid ${
                            currentCue === index ? COLORS.yellow : COLORS.border
                          }`,
                          borderRadius: 10,
                          background: currentCue === index ? COLORS.active : COLORS.card,
                          cursor: "pointer",
                          direction: "rtl",
                          fontFamily: "'Vazirmatn', sans-serif",
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
                            {renderEnglish(cue.en, `card-${index}`)}
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
              ) : (
                <section className="cards-section">
                  <div style={{ padding: 18, color: COLORS.muted, fontSize: 13 }}>
                    با اعمال زیرنویس‌ها، کارت‌ها نمایش داده می‌شوند.
                  </div>
                </section>
              )}

              {/* ✅ نوار پایین: فقط شکل فلش‌ها برعکس شد، کارکرد تغییر نکرد */}
              <div className="bottom-quickbar">
                <div className="bottom-quickbar-inner">
                  {/* این دکمه کارکردش Next است، ولی شکل فلش برعکس (ChevronRight) */}
                  <button
                    className="quick-btn"
                    onClick={goToNextCard}
                    title="کارت بعدی"
                    type="button"
                  >
                    <ChevronRight size={22} />
                  </button>

                  <button
                    className="quick-btn play"
                    onClick={togglePlay}
                    title={isPlaying ? "توقف" : "شروع"}
                    type="button"
                  >
                    {isPlaying ? <Pause size={22} /> : <Play size={22} />}
                  </button>

                  {/* این دکمه کارکردش Previous است، ولی شکل فلش برعکس (ChevronLeft) */}
                  <button
                    className="quick-btn"
                    onClick={goToPreviousCard}
                    title="کارت قبلی"
                    type="button"
                  >
                    <ChevronLeft size={22} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
