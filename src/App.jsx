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
  Maximize,
  Minimize,
  Upload,
} from "lucide-react";

const COLORS = {
  bg: "#0f1117",
  panel: "#16181f",
  card: "#1e212a",
  activeCard: "#252a38",
  border: "#2f3340",
  text: "#e6e8ef",
  muted: "#8c92a3",
  yellow: "#f4c430",
  teal: "#4dd0b8",
};

function timeToSeconds(timeStr) {
  if (!timeStr) return 0;
  const t = timeStr.replace(",", ".").trim().split(":");
  if (t.length === 3) return +t[0] * 3600 + +t[1] * 60 + +t[2];
  if (t.length === 2) return +t[0] * 60 + +t[1];
  return +t[0] || 0;
}

function formatTime(sec = 0) {
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return h > 0
    ? `${h}:${m.toString().padStart(2, "0")}:${ss.toString().padStart(2, "0")}`
    : `${m.toString().padStart(2, "0")}:${ss.toString().padStart(2, "0")}`;
}

function parseSRT(text) {
  if (!text) return [];
  const blocks = text.replace(/\r/g, "").split(/\n\s*\n/);
  const result = [];

  blocks.forEach((block) => {
    const lines = block.trim().split("\n");
    const timeLine = lines.find((l) => l.includes("-->"));
    if (!timeLine) return;

    const [start, end] = timeLine.split("-->");
    const text = lines.slice(lines.indexOf(timeLine) + 1).join(" ").replace(/<[^>]*>/g, "").trim();

    if (text) {
      result.push({
        start: timeToSeconds(start),
        end: timeToSeconds(end),
        text,
      });
    }
  });
  return result;
}

function mergeSubtitles(enText, faText) {
  const en = parseSRT(enText);
  const fa = parseSRT(faText);
  const len = Math.max(en.length, fa.length);

  return Array.from({ length: len }, (_, i) => ({
    id: i,
    start: (en[i] || fa[i])?.start || 0,
    end: (en[i] || fa[i])?.end || 0,
    en: en[i]?.text || "",
    fa: fa[i]?.text || "",
  }));
}

export default function LanguageReactorClone() {
  const videoRef = useRef(null);
  const cardsViewportRef = useRef(null);
  const cardRefs = useRef([]);

  const [videoUrl, setVideoUrl] = useState("");
  const [videoName, setVideoName] = useState("");

  const [enSubtitle, setEnSubtitle] = useState("");
  const [faSubtitle, setFaSubtitle] = useState("");
  const [enFileName, setEnFileName] = useState("");
  const [faFileName, setFaFileName] = useState("");

  const [cues, setCues] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(-1);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [repeat, setRepeat] = useState(false);

  const [showEn, setShowEn] = useState(true);
  const [showFa, setShowFa] = useState(true);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [wordPopup, setWordPopup] = useState(null);

  const currentCue = cues[currentIndex] || null;

  // ==================== اسکرول خودکار به وسط (مشابه Language Reactor) ====================
  const centerActiveCard = useCallback((smooth = true) => {
    const viewport = cardsViewportRef.current;
    const card = cardRefs.current[currentIndex];

    if (!viewport || !card) return;

    const viewportWidth = viewport.clientWidth;
    const cardWidth = card.offsetWidth;
    const cardLeft = card.offsetLeft;

    let target = cardLeft - viewportWidth / 2 + cardWidth / 2;

    const maxScroll = viewport.scrollWidth - viewport.clientWidth;
    target = Math.max(0, Math.min(target, maxScroll));

    viewport.scrollTo({
      left: target,
      behavior: smooth ? "smooth" : "auto",
    });
  }, [currentIndex]);

  // اجرای اسکرول خودکار هنگام تغییر کارت
  useEffect(() => {
    const id = requestAnimationFrame(() => centerActiveCard(true));
    return () => cancelAnimationFrame(id);
  }, [currentIndex, centerActiveCard]);

  // اسکرول دوباره هنگام تغییر اندازه یا فول‌اسکرین
  useEffect(() => {
    const handleResize = () => centerActiveCard(false);
    window.addEventListener("resize", handleResize);

    const observer = new ResizeObserver(() => centerActiveCard(false));
    if (cardsViewportRef.current) observer.observe(cardsViewportRef.current);

    return () => {
      window.removeEventListener("resize", handleResize);
      observer.disconnect();
    };
  }, [centerActiveCard]);

  // ==================== منطق پخش ====================
  const handleTimeUpdate = () => {
    if (!videoRef.current) return;

    const time = videoRef.current.currentTime;
    setCurrentTime(time);

    const idx = cues.findIndex((cue) => time >= cue.start && time < cue.end);

    if (idx !== -1 && idx !== currentIndex) {
      setCurrentIndex(idx);
    }

    // تکرار کارت
    if (repeat && currentCue && time >= currentCue.end) {
      videoRef.current.currentTime = currentCue.start;
    }
  };

  const jumpToCard = (index, play = true) => {
    const cue = cues[index];
    if (!cue || !videoRef.current) return;

    videoRef.current.currentTime = cue.start;
    setCurrentIndex(index);

    if (play) {
      videoRef.current.play().catch(() => {});
    }
  };

  const goNext = () => {
    if (currentIndex + 1 < cues.length) jumpToCard(currentIndex + 1);
  };

  const goPrev = () => {
    if (currentIndex - 1 >= 0) jumpToCard(currentIndex - 1);
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
    } else {
      videoRef.current.pause();
    }
  };

  const replayCard = () => {
    if (currentIndex >= 0) jumpToCard(currentIndex);
  };

  // ==================== آپلود ====================
  const handleVideo = (file) => {
    if (!file) return;
    if (videoUrl) URL.revokeObjectURL(videoUrl);

    const url = URL.createObjectURL(file);
    setVideoUrl(url);
    setVideoName(file.name);
    setCurrentIndex(-1);
  };

  const handleSubtitle = async (file, lang) => {
    if (!file) return;
    const text = await file.text();

    if (lang === "en") {
      setEnSubtitle(text);
      setEnFileName(file.name);
    } else {
      setFaSubtitle(text);
      setFaFileName(file.name);
    }
  };

  const applySubtitles = () => {
    const merged = mergeSubtitles(enSubtitle, faSubtitle);
    setCues(merged);
    setCurrentIndex(-1);
    cardRefs.current = [];
  };

  // ==================== کلیک روی کلمه (شبیه Language Reactor) ====================
  const handleWordClick = (word, e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setWordPopup({
      word: word.trim(),
      x: rect.left + rect.width / 2,
      y: rect.bottom + 8,
    });
  };

  const renderWords = (text, cueId) => {
    if (!text) return null;
    return text.split(/(\s+)/).map((part, i) => {
      if (/\s+/.test(part)) return part;
      return (
        <span
          key={i}
          onClick={(e) => handleWordClick(part, e)}
          style={{
            cursor: "pointer",
            padding: "1px 2px",
            borderRadius: "3px",
          }}
          onMouseEnter={(e) => (e.target.style.background = "rgba(244,196,48,0.15)")}
          onMouseLeave={(e) => (e.target.style.background = "transparent")}
        >
          {part}
        </span>
      );
    });
  };

  // ==================== کنترل‌های کیبورد ====================
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === " ") {
        e.preventDefault();
        togglePlay();
      }
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goPrev();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [goNext, goPrev]);

  // ==================== رندر ====================
  return (
    <div style={{ background: COLORS.bg, color: COLORS.text, minHeight: "100vh", fontFamily: "Vazirmatn, sans-serif" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "16px" }}>
        {/* هدر */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ color: COLORS.yellow, fontSize: 28 }}>LR</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 22 }}>Language Reactor</div>
              <div style={{ fontSize: 12, color: COLORS.muted }}>نسخه فارسی</div>
            </div>
          </div>
          <div style={{ color: COLORS.muted, fontSize: 13 }}>کارت فعال همیشه در مرکز</div>
        </div>

        {/* آپلود */}
        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          <label style={uploadStyle()}>
            <Upload size={16} /> {videoName || "انتخاب ویدیو"}
            <input type="file" accept="video/*" hidden onChange={(e) => handleVideo(e.target.files[0])} />
          </label>
          <label style={uploadStyle()}>
            <Upload size={16} /> {enFileName || "زیرنویس انگلیسی"}
            <input type="file" accept=".srt,.vtt" hidden onChange={(e) => handleSubtitle(e.target.files[0], "en")} />
          </label>
          <label style={uploadStyle()}>
            <Upload size={16} /> {faFileName || "زیرنویس فارسی"}
            <input type="file" accept=".srt,.vtt" hidden onChange={(e) => handleSubtitle(e.target.files[0], "fa")} />
          </label>
          <button onClick={applySubtitles} style={applyButtonStyle()}>اعمال زیرنویس</button>
        </div>

        {/* پلیر اصلی */}
        <div style={{ background: "#000", borderRadius: 12, overflow: "hidden", border: `1px solid ${COLORS.border}` }}>
          {/* ویدیو */}
          <div style={{ position: "relative", background: "#000" }}>
            {!videoUrl ? (
              <div style={{ height: 420, display: "flex", alignItems: "center", justifyContent: "center", color: COLORS.muted }}>
                ویدیو را انتخاب کنید
              </div>
            ) : (
              <video
                ref={videoRef}
                src={videoUrl}
                style={{ width: "100%", maxHeight: "62vh", display: "block" }}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={(e) => setDuration(e.target.duration)}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onClick={togglePlay}
              />
            )}

            {/* زیرنویس روی ویدیو (Dual) */}
            {currentCue && (
              <div style={{ position: "absolute", bottom: 30, left: 0, right: 0, textAlign: "center", pointerEvents: "none" }}>
                {showEn && currentCue.en && (
                  <div style={{ color: COLORS.yellow, fontSize: 20, fontWeight: 600, marginBottom: 4, textShadow: "0 2px 6px black" }}>
                    {currentCue.en}
                  </div>
                )}
                {showFa && currentCue.fa && (
                  <div style={{ color: COLORS.teal, fontSize: 18, textShadow: "0 2px 6px black" }}>
                    {currentCue.fa}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* لیست کارت‌ها (Transcript) */}
          {cues.length > 0 && (
            <div style={{ background: COLORS.panel, borderTop: `1px solid ${COLORS.border}` }}>
              <div style={{ padding: "8px 16px 4px", color: COLORS.muted, fontSize: 13 }}>
                Transcript • {cues.length} جمله
              </div>

              <div
                ref={cardsViewportRef}
                style={{
                  overflowX: "auto",
                  overflowY: "hidden",
                  direction: "ltr",
                  paddingBottom: 8,
                }}
              >
                <div style={{ display: "flex", gap: 12, padding: "0 40px" }}>
                  {cues.map((cue, index) => (
                    <div
                      key={index}
                      ref={(el) => (cardRefs.current[index] = el)}
                      onClick={() => jumpToCard(index)}
                      style={{
                        width: 280,
                        minWidth: 280,
                        padding: 14,
                        borderRadius: 10,
                        border: currentIndex === index ? `2px solid ${COLORS.yellow}` : `1px solid ${COLORS.border}`,
                        background: currentIndex === index ? COLORS.activeCard : COLORS.card,
                        cursor: "pointer",
                        direction: "rtl",
                        flexShrink: 0,
                      }}
                    >
                      <div style={{ fontSize: 11, color: COLORS.muted, marginBottom: 6 }}>
                        {formatTime(cue.start)}
                      </div>
                      <div style={{ color: COLORS.yellow, fontSize: 14, lineHeight: 1.5, marginBottom: 6 }}>
                        {renderWords(cue.en, index)}
                      </div>
                      <div style={{ color: COLORS.teal, fontSize: 13.5, lineHeight: 1.6 }}>
                        {cue.fa}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* کنترل‌ها (پایین) */}
          {videoUrl && (
            <div style={{ background: COLORS.panel, padding: "12px 16px", borderTop: `1px solid ${COLORS.border}` }}>
              <input
                type="range"
                min={0}
                max={duration || 0}
                step="0.01"
                value={currentTime}
                onChange={(e) => {
                  if (videoRef.current) videoRef.current.currentTime = +e.target.value;
                }}
                style={{ width: "100%", accentColor: COLORS.yellow, marginBottom: 10 }}
              />

              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button onClick={goPrev} style={controlBtn()}><ChevronLeft size={20} /></button>
                <button onClick={togglePlay} style={playBtn(isPlaying)}>
                  {isPlaying ? <Pause size={22} /> : <Play size={22} />}
                </button>
                <button onClick={goNext} style={controlBtn()}><ChevronRight size={20} /></button>
                <button onClick={replayCard} style={controlBtn()}><RotateCcw size={18} /></button>

                <button
                  onClick={() => setRepeat(!repeat)}
                  style={{
                    ...controlBtn(),
                    background: repeat ? "rgba(244,196,48,0.15)" : "transparent",
                    borderColor: repeat ? COLORS.yellow : COLORS.border,
                  }}
                >
                  <Repeat2 size={18} />
                </button>

                <div style={{ marginLeft: "auto", color: COLORS.muted, fontSize: 13 }}>
                  {formatTime(currentTime)} / {formatTime(duration)}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* پاپ‌آپ ترجمه کلمه */}
      {wordPopup && (
        <div
          style={{
            position: "fixed",
            left: wordPopup.x,
            top: wordPopup.y,
            transform: "translateX(-50%)",
            background: "#1f232d",
            border: `1px solid ${COLORS.border}`,
            borderRadius: 8,
            padding: "10px 14px",
            zIndex: 9999,
            boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
            minWidth: 180,
          }}
          onClick={() => setWordPopup(null)}
        >
          <div style={{ color: COLORS.yellow, fontWeight: 600 }}>{wordPopup.word}</div>
          <div style={{ color: COLORS.muted, fontSize: 13, marginTop: 4 }}>
            ترجمه: (در نسخه واقعی از دیکشنری استفاده می‌شود)
          </div>
          <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 6 }}>
            کلیک مجدد برای بستن
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== استایل‌های کمکی ====================
function uploadStyle() {
  return {
    flex: 1,
    minWidth: 180,
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 14px",
    border: `1px dashed ${COLORS.border}`,
    borderRadius: 8,
    background: COLORS.panel,
    cursor: "pointer",
    fontSize: 13,
  };
}

function applyButtonStyle() {
  return {
    background: COLORS.yellow,
    color: "#111",
    border: "none",
    padding: "0 20px",
    borderRadius: 8,
    fontWeight: 700,
    cursor: "pointer",
  };
}

function controlBtn() {
  return {
    width: 38,
    height: 36,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "transparent",
    border: `1px solid ${COLORS.border}`,
    borderRadius: 8,
    color: COLORS.text,
    cursor: "pointer",
  };
}

function playBtn(isPlaying) {
  return {
    width: 48,
    height: 36,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: COLORS.yellow,
    color: "#111",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
  };
}
