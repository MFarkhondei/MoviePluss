import React, {
  useCallback,
  useEffect,
  useMemo,
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

const ENCODINGS = [
  { value: "utf-8", label: "UTF-8" },
  { value: "windows-1256", label: "Windows-1256" },
  { value: "iso-8859-6", label: "ISO-8859-6" },
  { value: "windows-1252", label: "Windows-1252" },
];

function timeToSeconds(value = "") {
  const parts = value.trim().replace(",", ".").split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return Number(parts[0]) || 0;
}

function formatTime(value = 0) {
  if (!Number.isFinite(value)) return "00:00";
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = Math.floor(value % 60);

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
      2,
      "0"
    )}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
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

function SettingRange({ label, value, min, max, onChange, step = 0.05 }) {
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
        step={step}
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

  const cuesRef = useRef([]);
  const currentCueRef = useRef(-1);
  const repeatRef = useRef(false);

  const translationCacheRef = useRef({});
  const translationWordCacheRef = useRef({});
  const hideControlsTimerRef = useRef(null);

  const suppressOutsideClickRef = useRef(false);

  const dragStateRef = useRef({
    dragging: false,
    startY: 0,
    startCardsRatio: 0,
  });

  const [videoUrl, setVideoUrl] = useState("");
  const [videoName, setVideoName] = useState("");

  const [englishFile, setEnglishFile] = useState(null);
  const [persianFile, setPersianFile] = useState("");

  const [englishText, setEnglishText] = useState("");
  const [persianText, setPersianText] = useState("");

  const [englishEncoding, setEnglishEncoding] = useState("utf-8");
  const [persianEncoding, setPersianEncoding] = useState("utf-8");

  const [cues, setCues] = useState([]);
  const [currentCue, setCurrentCue] = useState(-1);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);

  const [playbackRate, setPlaybackRate] = useState(1);

  const [repeatOn, setRepeatOn] = useState(false);

  const [showEnglish, setShowEnglish] = useState(false);
  const [showPersian, setShowPersian] = useState(false);

  const [filesOpen, setFilesOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [controlsVisible, setControlsVisible] = useState(true);

  const [cardsLayout, setCardsLayout] = useState("horizontal");

  // تنظیمات تصویر
  const [brightness, setBrightness] = useState(100);

  const [subtitleSize, setSubtitleSize] = useState(100);
  const [subtitleBottom, setSubtitleBottom] = useState(70);
  const [subtitleBackground, setSubtitleBackground] = useState(true);

  // ✅ ارتفاع split: نسبت ارتفاع کارت‌ها نسبت به کل بخش player (ویدیو+کارت‌ها)
  const [cardsRatio, setCardsRatio] = useState(0.48); // 0..1
  const minCardsRatio = 0.22;
  const maxCardsRatio = 0.78;

  // popup کلمه
  const [wordPopup, setWordPopup] = useState(null);
  const [cardTranslateLoading, setCardTranslateLoading] = useState({});

  const activeCue = currentCue >= 0 ? cuesRef.current[currentCue] : null;

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
      videoRef.current.volume = volume;
    }
  }, [playbackRate, volume]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === playerRef.current);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    if (videoUrl) return () => URL.revokeObjectURL(videoUrl);
  }, [videoUrl]);

  useEffect(() => {
    if (currentCue < 0 || !cardsRef.current) return;

    const scrollContainer = cardsRef.current.querySelector(".cards-container");
    if (!scrollContainer) return;

    const cardElement = scrollContainer.querySelector(`[data-card="${currentCue}"]`);
    if (!cardElement) return;

    const isVertical = cardsLayout === "vertical";

    if (isVertical) {
      const targetTop =
        cardElement.offsetTop - scrollContainer.clientHeight / 2 + cardElement.offsetHeight / 2;
      scrollContainer.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
    } else {
      const targetLeft =
        cardElement.offsetLeft - scrollContainer.clientWidth / 2 + cardElement.offsetWidth / 2;
      scrollContainer.scrollTo({ left: Math.max(0, targetLeft), behavior: "smooth" });
    }
  }, [currentCue, cardsLayout]);

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

  const seekBy = useCallback(
    (seconds) => {
      if (!videoRef.current) return;

      const nextTime = Math.max(
        0,
        Math.min(duration || videoRef.current.duration || 0, videoRef.current.currentTime + seconds)
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
      if (autoplay) playVideo();
    },
    [playVideo]
  );

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
    if (nextIndex < cuesRef.current.length) jumpToCue(nextIndex, true);
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

    const detectedIndex = list.findIndex((cue) => time >= cue.start && time < cue.end);
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

  const fetchWordTranslation = useCallback(async (word) => {
    const clean = (word || "").trim();
    if (!clean) return "";

    const key = `word:${clean.toLowerCase()}`;
    if (translationWordCacheRef.current[key]) return translationWordCacheRef.current[key];

    const response = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(clean)}&langpair=en|fa`
    );
    const data = await response.json();
    const faText = data?.responseData?.translatedText || "ترجمه پیدا نشد";
    translationWordCacheRef.current[key] = faText;
    return faText;
  }, []);

  const translateWordPopup = useCallback(
    async (word, cardIndex) => {
      if (!word || cardIndex === undefined || cardIndex === null) return;

      const clean = word.trim();
      if (!clean) return;

      setWordPopup({ cardIndex, word: clean, text: "ترجمه...", loading: true });

      try {
        const cacheKey = `word:${clean.toLowerCase()}`;
        if (translationWordCacheRef.current[cacheKey]) {
          setWordPopup({
            cardIndex,
            word: clean,
            text: translationWordCacheRef.current[cacheKey],
            loading: false,
          });
          return;
        }

        const fa = await fetchWordTranslation(clean);
        setWordPopup({ cardIndex, word: clean, text: fa, loading: false });
      } catch {
        setWordPopup({ cardIndex, word: clean, text: "خطا در دریافت ترجمه", loading: false });
      }
    },
    [fetchWordTranslation]
  );

  const translateCardToPersian = async (cueIndex) => {
    const cue = cuesRef.current[cueIndex];
    if (!cue) return;
    if (!cue.en?.trim()) return;
    if (cue.fa && cue.fa.trim()) return;
    if (cardTranslateLoading[cueIndex]) return;

    setCardTranslateLoading((prev) => ({ ...prev, [cueIndex]: true }));

    const enText = cue.en.trim();
    const key = `card:${enText}`;

    try {
      if (translationCacheRef.current[key]) {
        const cachedFa = translationCacheRef.current[key];

        setCues((prev) => {
          const next = [...prev];
          next[cueIndex] = { ...next[cueIndex], fa: cachedFa };
          return next;
        });
        cuesRef.current = cuesRef.current.map((c, i) => (i === cueIndex ? { ...c, fa: cachedFa } : c));
        return;
      }

      const response = await fetch(
        `https://api.mymemory.translated.net/get?q=${encodeURIComponent(enText)}&langpair=en|fa`
      );
      const data = await response.json();
      const faText = data?.responseData?.translatedText || "ترجمه پیدا نشد";

      translationCacheRef.current[key] = faText;

      setCues((prev) => {
        const next = [...prev];
        next[cueIndex] = { ...next[cueIndex], fa: faText };
        return next;
      });
      cuesRef.current = cuesRef.current.map((c, i) => (i === cueIndex ? { ...c, fa: faText } : c));
    } catch {
      const faText = "خطا در دریافت ترجمه";
      setCues((prev) => {
        const next = [...prev];
        next[cueIndex] = { ...next[cueIndex], fa: faText };
        return next;
      });
      cuesRef.current = cuesRef.current.map((c, i) => (i === cueIndex ? { ...c, fa: faText } : c));
    } finally {
      setCardTranslateLoading((prev) => {
        const n = { ...prev };
        delete n[cueIndex];
        return n;
      });
    }
  };

  const renderEnglish = (text, prefix, cardIndex) => {
    return text.split(/(\s+)/).map((token, index) => {
      if (/^\s+$/.test(token)) return token;

      const isWord = /^[A-Za-z]+(?:'[A-Za-z]+)?$/.test(token) || /^[A-Za-z]+$/.test(token);
      const clickable = isWord && token.length > 1;

      if (clickable) {
        return (
          <span
            key={`${prefix}-${index}`}
            data-word-token="1"
            style={{
              borderBottom: `1px dotted ${COLORS.yellow}`,
              cursor: "pointer",
              color: COLORS.yellow,
              fontWeight: 700,
              userSelect: "none",
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              suppressOutsideClickRef.current = true;

              // popup را همان لحظه ست می‌کنیم
              setWordPopup({ cardIndex, word: String(token), text: "ترجمه...", loading: true });

              translateWordPopup(token, cardIndex);
              setTimeout(() => (suppressOutsideClickRef.current = false), 120);
            }}
          >
            {token}
          </span>
        );
      }

      return (
        <span
          key={`${prefix}-${index}`}
          style={{
            borderBottom: `1px dotted ${COLORS.yellow}`,
            cursor: "default",
          }}
        >
          {token}
        </span>
      );
    });
  };

  // بستن popup با کلیک بیرون
  useEffect(() => {
    const onDocClick = (e) => {
      if (suppressOutsideClickRef.current) return;

      const target = e.target;
      if (!target) return;

      const popup = target.closest?.(".word-popup");
      if (popup) return;

      const wordEl = target.closest?.("[data-word-token='1']");
      if (wordEl) return;

      setWordPopup(null);
    };

    document.addEventListener("click", onDocClick, true);
    return () => document.removeEventListener("click", onDocClick, true);
  }, []);

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

      showControlsTemporarily();
    };

    window.addEventListener("keydown", handleKeyboard);
    return () => window.removeEventListener("keydown", handleKeyboard);
  }, [goToNextCard, goToPreviousCard, seekBy, showControlsTemporarily, toggleFullscreen, togglePlay]);

  // Pointer drag برای split
  const onStartDrag = (e) => {
    if (!playerRef.current) return;

    dragStateRef.current.dragging = true;
    dragStateRef.current.startY = e.clientY;
    dragStateRef.current.startCardsRatio = cardsRatio;

    e.preventDefault();
    e.stopPropagation();
  };

  useEffect(() => {
    const onMove = (e) => {
      if (!dragStateRef.current.dragging) return;
      if (!playerRef.current) return;

      const rect = playerRef.current.getBoundingClientRect();
      const totalH = rect.height;

      // y تغییر نسبت به کل
      const dy = e.clientY - dragStateRef.current.startY;
      const deltaRatio = dy / totalH;

      // چون drag handle بین بالاست/پایین، جهت را طوری تنظیم می‌کنیم:
      // اگر dy مثبت باشد یعنی پایین کشیده‌ایم => کارت‌ها بیشتر
      let next = dragStateRef.current.startCardsRatio + deltaRatio;

      next = Math.max(minCardsRatio, Math.min(maxCardsRatio, next));
      setCardsRatio(next);
    };

    const onUp = () => {
      dragStateRef.current.dragging = false;
    };

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [cardsRatio]);

  const videoBasis = useMemo(() => `${Math.round((1 - cardsRatio) * 1000) / 10}%`, [cardsRatio]);
  const cardsBasis = useMemo(() => `${Math.round(cardsRatio * 1000) / 10}%`, [cardsRatio]);

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

        .top-area {
          display: flex;
          flex-direction: column;
          height: 100%;
          min-height: 0;
        }

        .video-stage {
          position: relative;
          width: 100%;
          background: #000;
          flex: 0 0 auto;
          min-height: 0;
        }

        .video-stage video {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: contain;
          background: #000;
          touch-action: pan-y;
        }

        .split-handle {
          height: 10px;
          cursor: ns-resize;
          background: rgba(255,255,255,0.04);
          border-top: 1px solid rgba(255,255,255,0.06);
          border-bottom: 1px solid rgba(255,255,255,0.06);
          z-index: 5;
          flex: 0 0 auto;
        }

        .split-handle:active {
          background: rgba(242,201,76,0.12);
        }

        .cards-section {
          background: ${COLORS.panel};
          font-family: 'Vazirmatn', sans-serif;
          flex: 1 1 auto;
          min-height: 0;
          border-top: 1px solid ${COLORS.border};
          display: flex;
          flex-direction: column;
          overflow: hidden;
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
          display: flex;
          align-items: center;
          justify-content: center;
          width: 26px;
          height: 26px;
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

        .cards-section-horizontal .cards-container {
          flex-direction: row;
          overflow-x: auto;
          overflow-y: hidden;
        }

        .cards-section-horizontal .subtitle-card {
          min-width: 230px;
          max-width: 230px;
          flex-shrink: 0;
          padding: 11px;
        }

        .cards-section-vertical .cards-container {
          flex-direction: column;
          overflow-y: auto;
          overflow-x: hidden;
          direction: rtl;
        }

        .cards-section-vertical .subtitle-card {
          width: 100%;
          padding: 11px;
        }

        .subtitle-card {
          position: relative;
          z-index: 1; /* ✅ زیر overlay */
        }

        .bottom-quickbar {
          flex: 0 0 auto;
          z-index: 60;
          padding: 14px 14px 18px;
          background: linear-gradient(
            rgba(13,15,21,0),
            rgba(13,15,21,.55) 25%,
            rgba(13,15,21,.98)
          );
          border-top: 1px solid rgba(255,255,255,0.06);
        }

        .bottom-quickbar-inner {
          direction: ltr;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 12px 12px;
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 18px;
          background: rgba(10,12,18,.62);
          backdrop-filter: blur(8px);
        }

        .quick-btn {
          direction: rtl;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 104px;
          height: 64px;
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(0,0,0,.25);
          color: ${COLORS.text};
          cursor: pointer;
          user-select: none;
          padding: 0;
        }

        .quick-btn.play {
          width: 140px;
          height: 64px;
          border-radius: 18px;
          background: rgba(242,201,76,.16);
          border-color: rgba(242,201,76,.35);
          color: ${COLORS.yellow};
        }

        .player-controls.hidden { opacity: 0; pointer-events: none; }

        .word-popup {
          position: absolute;
          z-index: 300;
          top: -10px;
          left: 0;
          right: 0;
          margin: 0 auto;
          width: calc(100% - 18px);
          max-width: 320px;
          background: rgba(20,23,31,.97);
          border: 1px solid ${COLORS.border};
          border-radius: 12px;
          box-shadow: 0 14px 40px rgba(0,0,0,.5);
          padding: 10px 12px;
          transform: translateY(-100%);
          direction: rtl;
          user-select: none;
        }

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
      `}</style>

      {/* Header */}
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
            <span style={{ fontWeight: 900, color: COLORS.yellow }}>{filesOpen ? "<" : ">"}</span>
          </span>
        </button>
      </header>

      {filesOpen && (
        <section className="upload-section">
          <style>{`
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
            }
            @media (max-width: 767px) {
              .upload-section { grid-template-columns: 1fr !important; }
            }
          `}</style>

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
            onEncoding={async (lang, enc) => {
              await changeSubtitleEncoding(lang, enc);
            }}
          />

          <SubtitleInput
            language="fa"
            file={persianFile}
            encoding={persianEncoding}
            color={COLORS.teal}
            onFile={handleSubtitleFile}
            onEncoding={async (lang, enc) => {
              await changeSubtitleEncoding(lang, enc);
            }}
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
          style={{ minHeight: videoUrl ? 560 : 320 }}
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
              {/* Top split container */}
              <div className="top-area" style={{ flex: 1, minHeight: 0 }}>
                {/* VIDEO area */}
                <div
                  className="video-stage"
                  style={{
                    flexBasis: videoBasis,
                    flex: `0 0 ${videoBasis}`,
                    minHeight: 0,
                    height: videoBasis,
                  }}
                >
                  <video
                    ref={videoRef}
                    src={videoUrl}
                    onLoadedMetadata={handleVideoLoaded}
                    onTimeUpdate={handleTimeUpdate}
                    onPlay={() => {
                      setIsPlaying(true);
                      setControlsVisible(true);
                    }}
                    onPause={() => setIsPlaying(false)}
                    onDoubleClick={toggleFullscreen}
                    onClick={togglePlay}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    style={{
                      filter: `brightness(${brightness}%)`,
                      height: "100%",
                    }}
                  />

                  {/* Player controls */}
                  <div
                    className={`player-controls ${controlsVisible ? "" : "hidden"}`}
                    style={{
                      position: "absolute",
                      right: 0,
                      left: 0,
                      bottom: 0,
                      padding: "70px 14px 18px",
                      background: "linear-gradient(transparent, rgba(0,0,0,.9))",
                      zIndex: 80,
                    }}
                    onClick={(e) => e.stopPropagation()}
                    onContextMenu={(e) => e.stopPropagation()}
                  >
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      <input
                        type="range"
                        min="0"
                        max={duration || 0}
                        step="0.01"
                        value={currentTime}
                        onChange={(event) => seekTo(event.target.value)}
                        style={{
                          direction: "ltr",
                          accentColor: COLORS.yellow,
                          width: "100%",
                        }}
                      />

                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 10,
                          flexWrap: "nowrap",
                          whiteSpace: "nowrap",
                        }}
                      >
                        <span
                          style={{
                            color: COLORS.text,
                            fontSize: 11,
                            minWidth: 210,
                            direction: "ltr",
                            fontFamily: "'Vazirmatn', sans-serif",
                            flex: "0 0 auto",
                          }}
                        >
                          {formatTime(currentTime)} / {formatTime(duration)}{" "}
                          <span style={{ color: COLORS.muted }}>
                            (-{formatTime(Math.max(0, (duration || 0) - currentTime))})
                          </span>
                        </span>

                        <div style={{ flex: 1 }} />

                        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: "0 0 auto" }}>
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
                      </div>
                    </div>

                    {settingsOpen && (
                      <div
                        className="settings-popup"
                        onClick={(event) => event.stopPropagation()}
                        onContextMenu={(event) => event.stopPropagation()}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 10,
                            marginBottom: 10,
                            paddingBottom: 10,
                            borderBottom: "1px solid rgba(255,255,255,0.06)",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <Settings size={16} color={COLORS.yellow} />
                            <span style={{ color: COLORS.text, fontSize: 12, fontWeight: 800 }}>تنظیمات</span>
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

                        <SettingRange
                          label="روشنایی"
                          value={brightness}
                          min={50}
                          max={150}
                          onChange={setBrightness}
                          step={1}
                        />

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
                            <span>سرعت پخش</span>
                            <span style={{ color: COLORS.muted }}>{playbackRate.toFixed(2)}x</span>
                          </div>
                          <input
                            type="range"
                            min={0.5}
                            max={2}
                            step={0.05}
                            value={playbackRate}
                            onChange={(e) => setPlaybackRate(Number(e.target.value))}
                          />
                        </label>

                        <SettingRange
                          label="اندازه زیرنویس"
                          value={subtitleSize}
                          min={60}
                          max={180}
                          onChange={setSubtitleSize}
                          step={1}
                        />

                        <SettingRange
                          label="موقعیت زیرنویس"
                          value={subtitleBottom}
                          min={5}
                          max={180}
                          onChange={setSubtitleBottom}
                          step={1}
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
                          <input type="checkbox" checked={repeatOn} onChange={(e) => setRepeatOn(e.target.checked)} />
                        </label>
                      </div>
                    )}
                  </div>

                  {/* ✅ Overlay: باید بالاتر از همه صفحات باشد */}
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
                        zIndex: 1000, // ✅ بالا‌ترین لایه
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
                          }}
                        >
                          {renderEnglish(activeCue.en, "overlay", -1)}
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
                            pointerEvents: "auto",
                          }}
                        >
                          {activeCue.fa}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Split handle */}
                <div
                  className="split-handle"
                  onPointerDown={onStartDrag}
                  title="تغییر ارتفاع"
                />

                {/* Cards area */}
                <section
                  className="cards-section cards-section-horizontal"
                  style={{
                    flexBasis: cardsBasis,
                    flex: `0 0 ${cardsBasis}`,
                    minHeight: 0,
                    borderTop: "none",
                  }}
                >
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

                  <div
                    ref={cardsRef}
                    className={`cards-container`}
                    style={{
                      flexDirection: cardsLayout === "vertical" ? "column" : "row",
                      overflowX: cardsLayout === "vertical" ? "hidden" : "auto",
                      overflowY: cardsLayout === "vertical" ? "auto" : "hidden",
                      direction: cardsLayout === "vertical" ? "rtl" : "ltr",
                    }}
                  >
                    {cues.length > 0 ? (
                      cues.map((cue, index) => {
                        const translating = !!cardTranslateLoading[index];
                        const faMissing = !cue.fa || !cue.fa.trim();
                        const canShowTranslateBtn = faMissing && !!cue.en?.trim();
                        const isWordPopupHere = wordPopup && wordPopup.cardIndex === index;

                        return (
                          <div
                            key={index}
                            data-card={index}
                            className="subtitle-card"
                            onClick={() => jumpToCue(index, true)}
                            style={{
                              border: `1px solid ${currentCue === index ? COLORS.yellow : COLORS.border}`,
                              borderRadius: 10,
                              background: currentCue === index ? COLORS.active : COLORS.card,
                              cursor: "pointer",
                              direction: "rtl",
                              fontFamily: "'Vazirmatn', sans-serif",
                              padding: cardsLayout === "horizontal" ? 11 : 11,
                              minWidth: cardsLayout === "horizontal" ? 230 : undefined,
                              maxWidth: cardsLayout === "horizontal" ? 230 : undefined,
                            }}
                          >
                            {isWordPopupHere && (
                              <div className="word-popup" onClick={(e) => e.stopPropagation()}>
                                <div className="word-popup-header">
                                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                    <span style={{ color: COLORS.yellow, fontWeight: 900, fontSize: 13 }}>
                                      {wordPopup.word}
                                    </span>
                                  </div>
                                  <button
                                    className="word-popup-close"
                                    type="button"
                                    onClick={() => setWordPopup(null)}
                                    aria-label="بستن"
                                    title="بستن"
                                  >
                                    <X size={16} />
                                  </button>
                                </div>
                                <div style={{ color: COLORS.teal, fontSize: 14, fontWeight: 800, lineHeight: 1.6 }}>
                                  {wordPopup.text}
                                </div>
                              </div>
                            )}

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
                                {renderEnglish(cue.en, `card-${index}`, index)}
                              </div>
                            )}

                            {canShowTranslateBtn && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  translateCardToPersian(index);
                                }}
                                disabled={translating}
                                style={{
                                  width: "100%",
                                  marginTop: 10,
                                  border: `1px solid ${COLORS.border}`,
                                  background: "rgba(0,0,0,.25)",
                                  color: COLORS.text,
                                  padding: "9px 10px",
                                  borderRadius: 10,
                                  cursor: translating ? "not-allowed" : "pointer",
                                  fontFamily: "'Vazirmatn', sans-serif",
                                  fontSize: 11,
                                  fontWeight: 900,
                                }}
                                title="ترجمه کل متن کارت به فارسی"
                              >
                                {translating ? "در حال ترجمه..." : "ترجمه به فارسی"}
                              </button>
                            )}

                            {cue.fa && cue.fa.trim() && (
                              <div
                                style={{
                                  marginTop: 10,
                                  color: COLORS.teal,
                                  fontSize: 12,
                                  lineHeight: 1.7,
                                  textAlign: "right",
                                  whiteSpace: "pre-wrap",
                                }}
                              >
                                {cue.fa}
                              </div>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <div style={{ padding: 18, color: COLORS.muted, fontSize: 13 }}>
                        با اعمال زیرنویس‌ها، کارت‌ها نمایش داده می‌شوند.
                      </div>
                    )}
                  </div>
                </section>
              </div>

              {/* Bottom quickbar */}
              <div className="bottom-quickbar">
                <div className="bottom-quickbar-inner">
                  <button
                    className="quick-btn"
                    onClick={goToPreviousCard}
                    title="کارت قبلی"
                    type="button"
                    aria-label="کارت قبلی"
                  >
                    <ChevronLeft size={26} />
                  </button>

                  <button
                    className="quick-btn play"
                    onClick={togglePlay}
                    title={isPlaying ? "توقف" : "شروع"}
                    type="button"
                    aria-label={isPlaying ? "توقف" : "شروع"}
                  >
                    {isPlaying ? <Pause size={26} /> : <Play size={26} />}
                  </button>

                  <button
                    className="quick-btn"
                    onClick={goToNextCard}
                    title="کارت بعدی"
                    type="button"
                    aria-label="کارت بعدی"
                  >
                    <ChevronRight size={26} />
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
