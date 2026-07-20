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
  Pause,
  Play,
  Repeat2,
  RotateCcw,
  Settings,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Upload,
  X,
} from "lucide-react";

const COLORS = {
  background: "#0d1017",
  panel: "#161b26",
  panelLight: "#202838",
  border: "#313b4d",
  text: "#f4f6fa",
  muted: "#9ca7b8",
  yellow: "#f7c948",
  teal: "#51d8c2",
  active: "#2b3850",
};

function timeToSeconds(time = "00:00:00") {
  const values = time
    .replace(",", ".")
    .trim()
    .split(":")
    .map(Number);

  if (values.length === 3) {
    return values[0] * 3600 + values[1] * 60 + values[2];
  }

  if (values.length === 2) {
    return values[0] * 60 + values[1];
  }

  return Number(values[0]) || 0;
}

function formatTime(seconds = 0) {
  if (!Number.isFinite(seconds)) return "00:00";

  const totalSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(
      minutes
    ).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(
    secs
  ).padStart(2, "0")}`;
}

function parseSubtitle(text = "") {
  if (!text.trim()) return [];

  return text
    .replace(/\r/g, "")
    .replace(/^WEBVTT.*?\n+/i, "")
    .split(/\n\s*\n/)
    .map((block) => {
      const lines = block.trim().split("\n");
      const timeLineIndex = lines.findIndex((line) =>
        line.includes("-->")
      );

      if (timeLineIndex === -1) return null;

      const [startText, endText] = lines[timeLineIndex].split("-->");

      const subtitleText = lines
        .slice(timeLineIndex + 1)
        .join(" ")
        .replace(/<[^>]*>/g, "")
        .trim();

      if (!subtitleText) return null;

      return {
        start: timeToSeconds(startText),
        end: timeToSeconds(endText.trim().split(/\s+/)[0]),
        text: subtitleText,
      };
    })
    .filter(Boolean);
}

function mergeSubtitles(englishText, persianText) {
  const englishList = parseSubtitle(englishText);
  const persianList = parseSubtitle(persianText);
  const length = Math.max(
    englishList.length,
    persianList.length
  );

  return Array.from({ length }, (_, index) => {
    const english = englishList[index];
    const persian = persianList[index];
    const base = english || persian;

    return {
      id: index,
      start: base?.start || 0,
      end: base?.end || 0,
      english: english?.text || "",
      persian: persian?.text || "",
    };
  });
}

function readSubtitleFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve("");
      return;
    }

    const reader = new FileReader();

    reader.onload = (event) => {
      resolve(event.target?.result || "");
    };

    reader.onerror = reject;
    reader.readAsText(file, "UTF-8");
  });
}

export default function App() {
  const videoRef = useRef(null);

  /*
    نکته مهم:
    cardsViewportRef روی کادر اسکرول‌دار قرار دارد.
    هر کارت با cardRefs ذخیره می‌شود.
  */
  const cardsViewportRef = useRef(null);
  const cardRefs = useRef([]);

  const playerRef = useRef(null);
  const currentCueRef = useRef(-1);

  const [videoUrl, setVideoUrl] = useState("");
  const [videoName, setVideoName] = useState("");

  const [englishSubtitleText, setEnglishSubtitleText] =
    useState("");
  const [persianSubtitleText, setPersianSubtitleText] =
    useState("");

  const [englishFileName, setEnglishFileName] = useState("");
  const [persianFileName, setPersianFileName] = useState("");

  const [cues, setCues] = useState([]);
  const [currentCueIndex, setCurrentCueIndex] = useState(-1);

  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [repeatCurrentCard, setRepeatCurrentCard] =
    useState(false);

  const [showEnglish, setShowEnglish] = useState(true);
  const [showPersian, setShowPersian] = useState(true);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [subtitleSize, setSubtitleSize] = useState(100);
  const [subtitleBottom, setSubtitleBottom] = useState(50);

  const activeCue = useMemo(() => {
    if (currentCueIndex < 0) return null;
    return cues[currentCueIndex] || null;
  }, [cues, currentCueIndex]);

  useEffect(() => {
    currentCueRef.current = currentCueIndex;
  }, [currentCueIndex]);

  /*
    ----------------------------------------------------------------
    تابع اصلی وسط‌چین کردن کارت فعال
    ----------------------------------------------------------------
    کارت فعال را پیدا می‌کند و scrollLeft را به اندازه‌ای تنظیم می‌کند
    که مرکز کارت با مرکز کادر کارت‌ها یکی شود.

    نکته:
    در ابتدا و انتهای لیست، کارت به اندازه امکان در مرکز می‌ماند.
    چون دیگر فضای اضافی برای اسکرول وجود ندارد، مقدار اسکرول محدود می‌شود.
  */
  const centerActiveCard = useCallback((smooth = true) => {
    const viewport = cardsViewportRef.current;
    const activeIndex = currentCueRef.current;
    const activeCard = cardRefs.current[activeIndex];

    if (!viewport || !activeCard || activeIndex < 0) return;

    const viewportWidth = viewport.clientWidth;
    const cardWidth = activeCard.offsetWidth;

    const targetScrollLeft =
      activeCard.offsetLeft -
      viewportWidth / 2 +
      cardWidth / 2;

    const maxScrollLeft =
      viewport.scrollWidth - viewport.clientWidth;

    const safeScrollLeft = Math.max(
      0,
      Math.min(targetScrollLeft, maxScrollLeft)
    );

    viewport.scrollTo({
      left: safeScrollLeft,
      behavior: smooth ? "smooth" : "auto",
    });
  }, []);

  /*
    هر زمان کارت فعال تغییر کند:
    - با پخش فیلم
    - دکمه کارت بعدی
    - دکمه کارت قبلی
    - کلیک روی یک کارت
    کارت جدید به وسط اسکرول می‌شود.
  */
  useEffect(() => {
    const animationFrame = requestAnimationFrame(() => {
      centerActiveCard(true);
    });

    return () => cancelAnimationFrame(animationFrame);
  }, [currentCueIndex, centerActiveCard]);

  /*
    هنگام تغییر اندازه پنجره یا ورود/خروج از fullscreen،
    کارت فعال دوباره بدون انیمیشن در مرکز محاسبه می‌شود.
  */
  useEffect(() => {
    const handleResize = () => {
      centerActiveCard(false);
    };

    window.addEventListener("resize", handleResize);

    const resizeObserver = new ResizeObserver(() => {
      centerActiveCard(false);
    });

    if (cardsViewportRef.current) {
      resizeObserver.observe(cardsViewportRef.current);
    }

    return () => {
      window.removeEventListener("resize", handleResize);
      resizeObserver.disconnect();
    };
  }, [centerActiveCard]);

  /*
    پس از ساخته شدن کارت‌ها در DOM،
    محل اسکرول را دوباره محاسبه می‌کنیم.
  */
  useEffect(() => {
    const timer = setTimeout(() => {
      centerActiveCard(false);
    }, 80);

    return () => clearTimeout(timer);
  }, [cues, centerActiveCard]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(
        document.fullscreenElement === playerRef.current
      );

      setTimeout(() => {
        centerActiveCard(false);
      }, 150);
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
  }, [centerActiveCard]);

  useEffect(() => {
    return () => {
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
      }
    };
  }, [videoUrl]);

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
    setCurrentCueIndex(-1);
    currentCueRef.current = -1;
  };

  const handleEnglishSubtitleFile = async (file) => {
    if (!file) return;

    const text = await readSubtitleFile(file);

    setEnglishSubtitleText(text);
    setEnglishFileName(file.name);
  };

  const handlePersianSubtitleFile = async (file) => {
    if (!file) return;

    const text = await readSubtitleFile(file);

    setPersianSubtitleText(text);
    setPersianFileName(file.name);
  };

  const applySubtitles = () => {
    const mergedCues = mergeSubtitles(
      englishSubtitleText,
      persianSubtitleText
    );

    cardRefs.current = [];
    setCues(mergedCues);
    setCurrentCueIndex(-1);
    currentCueRef.current = -1;
  };

  const togglePlay = async () => {
    if (!videoRef.current) return;

    if (videoRef.current.paused) {
      try {
        await videoRef.current.play();
      } catch (error) {
        console.error("Video play error:", error);
      }
    } else {
      videoRef.current.pause();
    }
  };

  const goToCard = useCallback(
    (index, shouldPlay = true) => {
      const cue = cues[index];

      if (!cue || !videoRef.current) return;

      videoRef.current.currentTime = cue.start;

      currentCueRef.current = index;
      setCurrentCueIndex(index);
      setCurrentTime(cue.start);

      if (shouldPlay) {
        videoRef.current.play().catch(() => {});
      }
    },
    [cues]
  );

  const goToNextCard = useCallback(() => {
    const nextIndex = currentCueRef.current + 1;

    if (nextIndex < cues.length) {
      goToCard(nextIndex, true);
    }
  }, [cues.length, goToCard]);

  const goToPreviousCard = useCallback(() => {
    const previousIndex = currentCueRef.current - 1;

    if (previousIndex >= 0) {
      goToCard(previousIndex, true);
      return;
    }

    if (videoRef.current) {
      videoRef.current.currentTime = 0;
    }
  }, [goToCard]);

  const replayCurrentCard = () => {
    if (currentCueIndex >= 0) {
      goToCard(currentCueIndex, true);
    }
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;

    const time = videoRef.current.currentTime;
    setCurrentTime(time);

    const currentIndex = currentCueRef.current;
    const currentCue = cues[currentIndex];

    /*
      اگر تکرار کارت فعال باشد،
      با رسیدن به انتهای کارت، فیلم به ابتدای همان کارت برمی‌گردد.
    */
    if (
      repeatCurrentCard &&
      currentCue &&
      time >= currentCue.end
    ) {
      videoRef.current.currentTime = currentCue.start;
      return;
    }

    const foundIndex = cues.findIndex(
      (cue) => time >= cue.start && time < cue.end
    );

    if (
      foundIndex !== -1 &&
      foundIndex !== currentCueRef.current
    ) {
      currentCueRef.current = foundIndex;
      setCurrentCueIndex(foundIndex);
    }
  };

  const handleLoadedMetadata = () => {
    if (!videoRef.current) return;

    setDuration(videoRef.current.duration || 0);
    videoRef.current.volume = volume;
  };

  const handleSeek = (value) => {
    if (!videoRef.current) return;

    const time = Number(value);
    videoRef.current.currentTime = time;
    setCurrentTime(time);
  };

  const handleVolume = (value) => {
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

  useEffect(() => {
    const handleKeyDown = (event) => {
      const element = document.activeElement;
      const tagName = element?.tagName?.toLowerCase();

      if (
        tagName === "input" ||
        tagName === "textarea" ||
        tagName === "select"
      ) {
        return;
      }

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
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [goToNextCard, goToPreviousCard]);

  return (
    <div dir="rtl" className="app">
      <style>{`
        * {
          box-sizing: border-box;
        }

        body {
          margin: 0;
          background: ${COLORS.background};
          color: ${COLORS.text};
          font-family: Vazirmatn, Tahoma, Arial, sans-serif;
        }

        button,
        input {
          font-family: inherit;
        }

        button {
          -webkit-tap-highlight-color: transparent;
        }

        .app {
          min-height: 100vh;
          background:
            radial-gradient(
              circle at top center,
              #182134 0,
              ${COLORS.background} 42%
            );
        }

        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 18px 24px;
          border-bottom: 1px solid ${COLORS.border};
          background: rgba(13, 16, 23, 0.8);
          backdrop-filter: blur(10px);
        }

        .brand {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .brand-title {
          margin: 0;
          font-size: 22px;
          font-weight: 900;
        }

        .brand-subtitle {
          margin-top: 3px;
          color: ${COLORS.muted};
          font-size: 11px;
        }

        .upload-area {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr auto;
          gap: 12px;
          max-width: 1200px;
          margin: 0 auto;
          padding: 18px;
        }

        .file-box {
          display: flex;
          align-items: center;
          gap: 9px;
          min-height: 46px;
          padding: 10px 12px;
          overflow: hidden;
          border: 1px dashed ${COLORS.border};
          border-radius: 9px;
          background: ${COLORS.panel};
          color: ${COLORS.text};
          cursor: pointer;
          font-size: 12px;
        }

        .file-box:hover {
          border-color: ${COLORS.yellow};
        }

        .file-name {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .apply-button {
          min-height: 46px;
          padding: 0 20px;
          border: none;
          border-radius: 9px;
          background: ${COLORS.yellow};
          color: #131313;
          font-weight: 900;
          cursor: pointer;
        }

        .apply-button:hover {
          filter: brightness(1.07);
        }

        .page-content {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 18px 30px;
        }

        .player {
          overflow: hidden;
          border: 1px solid ${COLORS.border};
          border-radius: 15px;
          background: #000;
          box-shadow: 0 22px 55px rgba(0, 0, 0, 0.3);
        }

        .video-area {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 360px;
          background: #000;
        }

        .video-area video {
          display: block;
          width: 100%;
          max-height: 65vh;
          background: #000;
          object-fit: contain;
        }

        .empty-video {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          min-height: 360px;
          padding: 25px;
          color: ${COLORS.muted};
          text-align: center;
          cursor: pointer;
        }

        .subtitle-overlay {
          position: absolute;
          right: 0;
          left: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 7px;
          padding: 0 20px;
          pointer-events: none;
        }

        .english-subtitle,
        .persian-subtitle {
          max-width: 92%;
          padding: 6px 13px;
          border-radius: 7px;
          background: rgba(0, 0, 0, 0.76);
          text-align: center;
          font-weight: 700;
          line-height: 1.8;
          text-shadow: 0 1px 3px #000;
        }

        .english-subtitle {
          color: ${COLORS.yellow};
          direction: ltr;
        }

        .persian-subtitle {
          color: ${COLORS.teal};
        }

        .settings-button {
          position: absolute;
          top: 13px;
          left: 13px;
          z-index: 10;
        }

        .settings-panel {
          position: absolute;
          top: 54px;
          left: 13px;
          z-index: 20;
          width: 255px;
          padding: 14px;
          border: 1px solid ${COLORS.border};
          border-radius: 10px;
          background: rgba(22, 27, 38, 0.97);
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
        }

        .setting-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin: 10px 0;
          color: ${COLORS.text};
          font-size: 12px;
        }

        .setting-range-label {
          display: flex;
          justify-content: space-between;
          margin-bottom: 5px;
          color: ${COLORS.muted};
          font-size: 11px;
        }

        .setting-range {
          width: 100%;
          accent-color: ${COLORS.yellow};
        }

        /*
          کادر قابل اسکرول کارت‌ها
          direction:ltr فقط برای عملکرد مطمئن scrollLeft است.
          خود محتوای کارت‌ها RTL باقی می‌ماند.
        */
        .cards-section {
          border-top: 1px solid ${COLORS.border};
          border-bottom: 1px solid ${COLORS.border};
          background: ${COLORS.panel};
          padding: 13px 0 10px;
        }

        .cards-title {
          display: flex;
          align-items: center;
          justify-content: space-between;
          max-width: 1050px;
          margin: 0 auto 10px;
          padding: 0 16px;
          color: ${COLORS.muted};
          font-size: 12px;
        }

        .cards-viewport {
          width: 100%;
          overflow-x: auto;
          overflow-y: hidden;
          direction: ltr;
          scroll-behavior: smooth;
          scrollbar-color: ${COLORS.border} ${COLORS.background};
          scrollbar-width: thin;
        }

        .cards-viewport::-webkit-scrollbar {
          height: 7px;
        }

        .cards-viewport::-webkit-scrollbar-track {
          background: ${COLORS.background};
        }

        .cards-viewport::-webkit-scrollbar-thumb {
          border-radius: 10px;
          background: ${COLORS.border};
        }

        /*
          padding دو طرف باعث می‌شود اولین و آخرین کارت
          نیز امکان رسیدن به وسط را داشته باشند.
        */
        .cards-list {
          display: flex;
          align-items: stretch;
          gap: 12px;
          width: max-content;
          min-width: 100%;
          padding: 4px max(16px, calc(50vw - 130px)) 12px;
        }

        .subtitle-card {
          width: 250px;
          min-width: 250px;
          min-height: 120px;
          padding: 12px;
          border: 1px solid ${COLORS.border};
          border-radius: 11px;
          background: ${COLORS.panelLight};
          color: ${COLORS.text};
          cursor: pointer;
          direction: rtl;
          text-align: right;
          transition:
            transform 0.2s ease,
            border-color 0.2s ease,
            background 0.2s ease,
            box-shadow 0.2s ease;
        }

        .subtitle-card:hover {
          border-color: ${COLORS.yellow};
          transform: translateY(-2px);
        }

        .subtitle-card.active {
          border-color: ${COLORS.yellow};
          background: ${COLORS.active};
          box-shadow: 0 0 0 1px rgba(247, 201, 72, 0.22);
        }

        .card-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
          color: ${COLORS.muted};
          font-size: 10px;
        }

        .card-english {
          color: ${COLORS.yellow};
          direction: ltr;
          text-align: left;
          font-size: 12px;
          line-height: 1.75;
        }

        .card-persian {
          margin-top: 7px;
          color: ${COLORS.teal};
          font-size: 12px;
          line-height: 1.8;
        }

        .controls {
          padding: 11px 14px 14px;
          background: ${COLORS.panel};
        }

        .progress {
          width: 100%;
          margin-bottom: 11px;
          accent-color: ${COLORS.yellow};
          cursor: pointer;
        }

        .control-row {
          display: flex;
          align-items: center;
          gap: 8px;
          direction: ltr;
          flex-wrap: wrap;
        }

        .control-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 38px;
          height: 34px;
          border: 1px solid transparent;
          border-radius: 8px;
          background: rgba(0, 0, 0, 0.28);
          color: ${COLORS.text};
          cursor: pointer;
        }

        .control-button:hover {
          border-color: ${COLORS.border};
          background: ${COLORS.panelLight};
        }

        .play-button {
          width: 48px;
          height: 39px;
          color: #161616;
          background: ${COLORS.yellow};
        }

        .play-button:hover {
          border-color: ${COLORS.yellow};
          background: ${COLORS.yellow};
        }

        .repeat-button.active {
          border-color: ${COLORS.yellow};
          color: ${COLORS.yellow};
          background: rgba(247, 201, 72, 0.13);
        }

        .volume-range {
          width: 90px;
          accent-color: ${COLORS.yellow};
        }

        .time {
          min-width: 105px;
          margin-left: auto;
          color: ${COLORS.muted};
          font-size: 12px;
          white-space: nowrap;
        }

        .fullscreen-button {
          margin-left: 0;
        }

        .player:fullscreen {
          width: 100vw;
          height: 100vh;
          border: none;
          border-radius: 0;
          background: #000;
        }

        .player:fullscreen .video-area {
          flex: 1;
          min-height: 0;
        }

        .player:fullscreen .video-area video {
          max-height: 100%;
          height: auto;
        }

        .player:fullscreen .cards-section {
          max-height: 23vh;
        }

        .player:fullscreen .cards-viewport {
          max-height: 18vh;
        }

        @media (max-width: 800px) {
          .upload-area {
            grid-template-columns: 1fr;
          }

          .apply-button {
            min-height: 44px;
          }

          .video-area,
          .empty-video {
            min-height: 230px;
          }

          .subtitle-card {
            width: 220px;
            min-width: 220px;
          }

          .cards-list {
            padding-right: max(12px, calc(50vw - 110px));
            padding-left: max(12px, calc(50vw - 110px));
          }

          .volume-range {
            display: none;
          }

          .time {
            min-width: 90px;
            font-size: 10px;
          }

          .header {
            padding: 14px;
          }

          .page-content {
            padding-right: 10px;
            padding-left: 10px;
          }
        }
      `}</style>

      <header className="header">
        <div className="brand">
          <Play color={COLORS.yellow} fill={COLORS.yellow} />
          <div>
            <h1 className="brand-title">فیلم پلاس</h1>
            <div className="brand-subtitle">
              تمرین زبان با فیلم و زیرنویس
            </div>
          </div>
        </div>

        <div style={{ color: COLORS.muted, fontSize: 12 }}>
          کارت فعال در مرکز نمایش داده می‌شود
        </div>
      </header>

      <section className="upload-area">
        <label className="file-box">
          <Upload size={17} color={COLORS.yellow} />
          <span className="file-name">
            {videoName || "انتخاب فایل فیلم"}
          </span>

          <input
            hidden
            type="file"
            accept="video/*"
            onChange={(event) =>
              handleVideoFile(event.target.files?.[0])
            }
          />
        </label>

        <label className="file-box">
          <Upload size={17} color={COLORS.yellow} />
          <span className="file-name">
            {englishFileName || "زیرنویس انگلیسی (SRT / VTT)"}
          </span>

          <input
            hidden
            type="file"
            accept=".srt,.vtt,.txt"
            onChange={(event) =>
              handleEnglishSubtitleFile(
                event.target.files?.[0]
              )
            }
          />
        </label>

        <label className="file-box">
          <Upload size={17} color={COLORS.teal} />
          <span className="file-name">
            {persianFileName || "زیرنویس فارسی (SRT / VTT)"}
          </span>

          <input
            hidden
            type="file"
            accept=".srt,.vtt,.txt"
            onChange={(event) =>
              handlePersianSubtitleFile(
                event.target.files?.[0]
              )
            }
          />
        </label>

        <button
          type="button"
          className="apply-button"
          onClick={applySubtitles}
        >
          اعمال زیرنویس
        </button>
      </section>

      <main className="page-content">
        <div ref={playerRef} className="player">
          <div className="video-area">
            {!videoUrl ? (
              <label className="empty-video">
                <Upload size={45} color={COLORS.yellow} />
                <strong>برای انتخاب فیلم کلیک کنید</strong>
                <span style={{ fontSize: 12 }}>
                  بعد از انتخاب فیلم، زیرنویس‌ها را اعمال کنید.
                </span>

                <input
                  hidden
                  type="file"
                  accept="video/*"
                  onChange={(event) =>
                    handleVideoFile(event.target.files?.[0])
                  }
                />
              </label>
            ) : (
              <>
                <video
                  ref={videoRef}
                  src={videoUrl}
                  onLoadedMetadata={handleLoadedMetadata}
                  onTimeUpdate={handleTimeUpdate}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onClick={togglePlay}
                />

                {activeCue && (
                  <div
                    className="subtitle-overlay"
                    style={{ bottom: subtitleBottom }}
                  >
                    {showEnglish && activeCue.english && (
                      <div
                        className="english-subtitle"
                        style={{
                          fontSize: `${16 * (subtitleSize / 100)}px`,
                        }}
                      >
                        {activeCue.english}
                      </div>
                    )}

                    {showPersian && activeCue.persian && (
                      <div
                        className="persian-subtitle"
                        style={{
                          fontSize: `${16 * (subtitleSize / 100)}px`,
                        }}
                      >
                        {activeCue.persian}
                      </div>
                    )}
                  </div>
                )}

                <div className="settings-button">
                  <button
                    type="button"
                    className="control-button"
                    title="تنظیمات"
                    onClick={() =>
                      setSettingsOpen((value) => !value)
                    }
                  >
                    {settingsOpen ? (
                      <X size={18} />
                    ) : (
                      <Settings size={18} />
                    )}
                  </button>
                </div>

                {settingsOpen && (
                  <div className="settings-panel">
                    <div className="setting-row">
                      <span>نمایش انگلیسی</span>
                      <input
                        type="checkbox"
                        checked={showEnglish}
                        onChange={(event) =>
                          setShowEnglish(event.target.checked)
                        }
                      />
                    </div>

                    <div className="setting-row">
                      <span>نمایش فارسی</span>
                      <input
                        type="checkbox"
                        checked={showPersian}
                        onChange={(event) =>
                          setShowPersian(event.target.checked)
                        }
                      />
                    </div>

                    <div style={{ marginTop: 15 }}>
                      <div className="setting-range-label">
                        <span>اندازه زیرنویس</span>
                        <span>{subtitleSize}%</span>
                      </div>

                      <input
                        className="setting-range"
                        type="range"
                        min="70"
                        max="180"
                        value={subtitleSize}
                        onChange={(event) =>
                          setSubtitleSize(
                            Number(event.target.value)
                          )
                        }
                      />
                    </div>

                    <div style={{ marginTop: 15 }}>
                      <div className="setting-range-label">
                        <span>موقعیت عمودی زیرنویس</span>
                        <span>{subtitleBottom}px</span>
                      </div>

                      <input
                        className="setting-range"
                        type="range"
                        min="15"
                        max="180"
                        value={subtitleBottom}
                        onChange={(event) =>
                          setSubtitleBottom(
                            Number(event.target.value)
                          )
                        }
                      />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {cues.length > 0 && (
            <section className="cards-section">
              <div className="cards-title">
                <span>کارت‌های زیرنویس</span>

                <span>
                  {currentCueIndex >= 0
                    ? `کارت ${currentCueIndex + 1} از ${
                        cues.length
                      }`
                    : `${cues.length} کارت`}
                </span>
              </div>

              {/* کادر اسکرول کارت‌ها */}
              <div
                ref={cardsViewportRef}
                className="cards-viewport"
              >
                <div className="cards-list">
                  {cues.map((cue, index) => (
                    <button
                      key={cue.id}
                      ref={(element) => {
                        cardRefs.current[index] = element;
                      }}
                      type="button"
                      className={`subtitle-card ${
                        currentCueIndex === index
                          ? "active"
                          : ""
                      }`}
                      onClick={() => goToCard(index, true)}
                    >
                      <div className="card-head">
                        <span>کارت {index + 1}</span>
                        <span>{formatTime(cue.start)}</span>
                      </div>

                      {cue.english && (
                        <div className="card-english">
                          {cue.english}
                        </div>
                      )}

                      {cue.persian && (
                        <div className="card-persian">
                          {cue.persian}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </section>
          )}

          {videoUrl && (
            <section className="controls">
              <input
                className="progress"
                type="range"
                min="0"
                max={duration || 0}
                step="0.01"
                value={currentTime}
                onChange={(event) =>
                  handleSeek(event.target.value)
                }
              />

              <div className="control-row">
                <button
                  type="button"
                  className="control-button"
                  title="کارت قبلی"
                  onClick={goToPreviousCard}
                >
                  <ChevronLeft size={21} />
                </button>

                <button
                  type="button"
                  className="control-button play-button"
                  title={isPlaying ? "توقف" : "پخش"}
                  onClick={togglePlay}
                >
                  {isPlaying ? (
                    <Pause size={22} fill="currentColor" />
                  ) : (
                    <Play size={22} fill="currentColor" />
                  )}
                </button>

                <button
                  type="button"
                  className="control-button"
                  title="کارت بعدی"
                  onClick={goToNextCard}
                >
                  <ChevronRight size={21} />
                </button>

                <button
                  type="button"
                  className="control-button"
                  title="پخش دوباره کارت فعال"
                  onClick={replayCurrentCard}
                >
                  <RotateCcw size={18} />
                </button>

                <button
                  type="button"
                  className={`control-button repeat-button ${
                    repeatCurrentCard ? "active" : ""
                  }`}
                  title="تکرار کارت فعال"
                  onClick={() =>
                    setRepeatCurrentCard((value) => !value)
                  }
                >
                  <Repeat2 size={18} />
                </button>

                <button
                  type="button"
                  className="control-button"
                  title={isMuted ? "وصل کردن صدا" : "قطع صدا"}
                  onClick={toggleMute}
                >
                  {isMuted ? (
                    <VolumeX size={18} />
                  ) : (
                    <Volume2 size={18} />
                  )}
                </button>

                <input
                  className="volume-range"
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={isMuted ? 0 : volume}
                  onChange={(event) =>
                    handleVolume(event.target.value)
                  }
                />

                <span className="time">
                  {formatTime(currentTime)} /{" "}
                  {formatTime(duration)}
                </span>

                <button
                  type="button"
                  className="control-button fullscreen-button"
                  title="تمام‌صفحه"
                  onClick={toggleFullscreen}
                >
                  {isFullscreen ? (
                    <Minimize size={18} />
                  ) : (
                    <Maximize size={18} />
                  )}
                </button>
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
