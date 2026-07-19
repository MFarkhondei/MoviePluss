import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import "vazirmatn/Vazirmatn-font-face.css";
import {
  Play, Pause, SkipBack, SkipForward, Repeat, Repeat1,
  Upload, Film, Gauge, RotateCcw, X, ChevronDown, ChevronUp
} from "lucide-react";

// ---------- design tokens ----------
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
  danger: "#E4574C",
};

const ENCODINGS = [
  { value: "utf-8", label: "UTF-8 (پیش‌فرض)" },
  { value: "windows-1256", label: "Windows-1256 (زیرنویس قدیمی فارسی/عربی)" },
  { value: "iso-8859-6", label: "ISO-8859-6" },
  { value: "windows-1252", label: "Windows-1252" },
];

// ---------- subtitle parsing ----------
function timeToSeconds(t) {
  const norm = t.trim().replace(",", ".");
  const parts = norm.split(":").map(Number);
  let h = 0, m = 0, s = 0;
  if (parts.length === 3) [h, m, s] = parts;
  else if (parts.length === 2) [m, s] = parts;
  return h * 3600 + m * 60 + s;
}

function parseSubtitleText(raw) {
  if (!raw || !raw.trim()) return [];
  const text = raw.replace(/\r/g, "").replace(/^WEBVTT.*\n+/i, "");
  const blocks = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const cues = [];
  for (const block of blocks) {
    const lines = block.split("\n");
    const timeLineIdx = lines.findIndex((l) => l.includes("-->"));
    if (timeLineIdx === -1) continue;
    const [startRaw, endRaw] = lines[timeLineIdx].split("-->");
    const start = timeToSeconds(startRaw);
    const end = timeToSeconds((endRaw || "").split(/\s+/)[0]);
    const content = lines.slice(timeLineIdx + 1).join(" ").replace(/<[^>]+>/g, "").trim();
    if (!content || isNaN(start) || isNaN(end)) continue;
    cues.push({ start, end, text: content });
  }
  return cues.sort((a, b) => a.start - b.start);
}

function mergeCues(enCues, faCues) {
  const len = Math.max(enCues.length, faCues.length);
  const merged = [];
  for (let i = 0; i < len; i++) {
    const en = enCues[i];
    const fa = faCues[i];
    const base = en || fa;
    if (!base) continue;
    merged.push({
      index: i + 1,
      start: base.start,
      end: base.end,
      en: en ? en.text : "",
      fa: fa ? fa.text : "",
    });
  }
  return merged;
}

function fmt(s) {
  if (!isFinite(s)) return "00:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

// ---------- file decoding ----------
function decodeFileRaw(buf, encoding) {
  try {
    return new TextDecoder(encoding, { fatal: false }).decode(buf);
  } catch {
    return new TextDecoder("utf-8", { fatal: false }).decode(buf);
  }
}

async function decodeFile(file, encoding) {
  const buf = await file.arrayBuffer();
  return decodeFileRaw(buf, encoding);
}

async function decodeAuto(file) {
  const buf = await file.arrayBuffer();
  const utf8Text = new TextDecoder("utf-8", { fatal: false }).decode(buf);

  // هورستیک ۱: replacement character زیاد = قطعاً UTF-8 نیست
  const badCount = (utf8Text.match(/\uFFFD/g) || []).length;
  if (badCount > 3) {
    const win = decodeFileRaw(buf, "windows-1256");
    return { text: win, encoding: "windows-1256" };
  }

  // هورستیک ۲: اگر هیچ حرف عربی/فارسی نداریم ولی بایت‌های بالای 0x7F داریم
  // احتمالاً فایل یک انکودینگ عربی است که UTF-8 اشتباه خوانده شده
  const hasArabic = /[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(utf8Text);
  if (!hasArabic && buf.byteLength > 50) {
    const hasHighBytes = Array.from(new Uint8Array(buf)).some((b) => b > 0x7F);
    if (hasHighBytes) {
      const win1256 = decodeFileRaw(buf, "windows-1256");
      if (/[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(win1256)) {
        return { text: win1256, encoding: "windows-1256" };
      }
    }
  }

  return { text: utf8Text, encoding: "utf-8" };
}

// ---------- main component ----------
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

  // --- رفرنس‌های همگام‌شده (بدون باعث رندر اضافی شدن) ---
  const cuesRef = useRef(cues);
  useEffect(() => { cuesRef.current = cues; }, [cues]);

  const repeatRef = useRef(repeatOn);
  useEffect(() => { repeatRef.current = repeatOn; }, [repeatOn]);

  const currentIndexRef = useRef(currentIndex);
  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);

  // --- اصلاح #۲ و #۳: رفرنس‌های جدید ---
  const seekingRef = useRef(false);         // آیا loop-seek در حال اجراست
  const userSeekingRef = useRef(false);     // آیا کاربر دستی دارد نوار را می‌کشد
  const wasPlayingBeforeLoopRef = useRef(false); // قبل از seek تکرار آیا پخش بود

  // --- اصلاح #۱: شمارش جملات با useMemo ---
  const enCueCount = useMemo(() => parseSubtitleText(enText).length, [enText]);
  const faCueCount = useMemo(() => parseSubtitleText(faText).length, [faText]);

  // --- اصلاح #۴: آزادسازی حافظه هنگام unmount یا تعویض ویدیو ---
  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  // ---- file handlers ----
  const onVideoFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(URL.createObjectURL(f));
    setVideoName(f.name);
    setIsPlaying(false);
    setCurrentIndex(-1);
  };

  const onSubFile = async (file, lang) => {
    if (!file) return;
    const { text, encoding } = await decodeAuto(file);
    if (lang === "en") {
      setEnFile(file);
      setEnEncoding(encoding);
      setEnText(text);
    } else {
      setFaFile(file);
      setFaEncoding(encoding);
      setFaText(text);
    }
  };

  const onEncodingChange = async (lang, encoding) => {
    if (lang === "en") {
      setEnEncoding(encoding);
      if (enFile) setEnText(await decodeFile(enFile, encoding));
    } else {
      setFaEncoding(encoding);
      if (faFile) setFaText(await decodeFile(faFile, encoding));
    }
  };

  const applySubtitles = useCallback(() => {
    const en = parseSubtitleText(enText);
    const fa = parseSubtitleText(faText);
    setCues(mergeCues(en, fa));
    setCurrentIndex(-1);
  }, [enText, faText]);

  // ---- اصلاح #۲ و #۳: منطق زمانی ----
  const onTimeUpdate = () => {
    const v = videoRef.current;
    if (!v) return;
    const t = v.currentTime;
    setCurrent(t);

    // اگر seek تکرار در حال اجراست، کاری نکن
    if (seekingRef.current) return;

    // اگر کاربر دارد دستی نوار را می‌کشد، تکرار را غیرفعال کن موقتاً
    if (userSeekingRef.current) return;

    const list = cuesRef.current;
    const lockedIdx = currentIndexRef.current;

    if (repeatRef.current && lockedIdx !== -1 && list[lockedIdx]) {
      const cue = list[lockedIdx];
      if (t >= cue.end - 0.04) {
        wasPlayingBeforeLoopRef.current = !v.paused;
        seekingRef.current = true;
        v.currentTime = cue.start;
      }
      return;
    }

    let idx = -1;
    for (let i = 0; i < list.length; i++) {
      if (t >= list[i].start && t < list[i].end) {
        idx = i;
        break;
      }
    }
    if (idx !== -1 && idx !== currentIndexRef.current) {
      currentIndexRef.current = idx;
      setCurrentIndex(idx);
    }
  };

  const onSeeked = () => {
    const v = videoRef.current;
    if (!v || !seekingRef.current) return;
    seekingRef.current = false;

    // اصلاح #۳: فقط اگر قبل از seek پخش بود، دوباره پخش کن
    if (repeatRef.current && wasPlayingBeforeLoopRef.current && v.paused) {
      v.play();
    }
  };

  useEffect(() => {
    if (currentIndex === -1 || !stripRef.current) return;
    const el = stripRef.current.querySelector(`[data-frame="${currentIndex}"]`);
    if (el) el.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [currentIndex]);

  const playPause = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play();
      setIsPlaying(true);
    } else {
      v.pause();
      setIsPlaying(false);
    }
  };

  const jumpTo = (idx, autoplay = true) => {
    const v = videoRef.current;
    const cue = cues[idx];
    if (!v || !cue) return;

    // همگام‌سازی فوری رفرنس تا onTimeUpdate با مقدار قدیمی رقابت نکند
    currentIndexRef.current = idx;
    seekingRef.current = false;
    userSeekingRef.current = false;

    v.currentTime = cue.start;
    setCurrentIndex(idx);
    setWordPopup(null);

    if (autoplay) {
      v.play();
      setIsPlaying(true);
    }
  };

  const replaySentence = () => {
    if (currentIndex === -1) return;
    jumpTo(currentIndex, true);
  };

  const nextSentence = () => currentIndex < cues.length - 1 && jumpTo(currentIndex + 1, true);
  const prevSentence = () => currentIndex > 0 && jumpTo(currentIndex - 1, true);

  useEffect(() => {
    const v = videoRef.current;
    if (v) v.playbackRate = rate;
  }, [rate, videoUrl]);

  // keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === "TEXTAREA" || tag === "INPUT") return;
      if (!videoRef.current) return;
      if (e.code === "Space") {
        e.preventDefault();
        playPause();
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        nextSentence();
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        prevSentence();
      } else if (e.code === "KeyR") {
        e.preventDefault();
        replaySentence();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, cues]);

  // ---- word translation ----
  const handleWordClick = async (rawWord) => {
    const word = rawWord.replace(/[^A-Za-z'-]/g, "");
    if (!word) return;
    const key = word.toLowerCase();
    if (translationCache.current[key]) {
      setWordPopup({ word, translation: translationCache.current[key] });
      return;
    }
    setWordPopup({ word, translation: "", loading: true });
    try {
      const res = await fetch(
        `https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=en|fa`
      );
      const data = await res.json();
      const translated = data?.responseData?.translatedText || "ترجمه یافت نشد";
      translationCache.current[key] = translated;
      setWordPopup({ word, translation: translated, loading: false });
    } catch {
      setWordPopup({ word, translation: "خطا در دریافت ترجمه", loading: false });
    }
  };

  const renderClickableEn = (text, keyPrefix) =>
    text.split(/(\s+)/).map((tok, i) =>
      /^\s+$/.test(tok) || !tok ? (
        tok
      ) : (
        <span
          key={`${keyPrefix}-${i}`}
          onClick={(e) => {
            e.stopPropagation();
            handleWordClick(tok);
          }}
          style={{ cursor: "pointer", borderBottom: "1px dotted rgba(242,201,76,0.55)" }}
        >
          {tok}
        </span>
      )
    );

  const activeCue = currentIndex !== -1 ? cues[currentIndex] : null;

  // --- اصلاح #۲: هندلرهای نوار پیشرفت ---
  const onProgressMouseDown = () => {
    userSeekingRef.current = true;
    seekingRef.current = false; // هر seek حلقه‌ای در حال اجرا را لغو کن
  };
  const onProgressMouseUp = (e) => {
    const v = videoRef.current;
    if (v) v.currentTime = Number(e.target.value);
    // کمی تأخیر تا seek تمام شود، بعد فلگ را بردار
    setTimeout(() => {
      userSeekingRef.current = false;
    }, 150);
  };
  const onProgressChange = (e) => {
    // به‌روزرسانی نمایشی بدون اعمال واقعی (تا mouseup)
    setCurrent(Number(e.target.value));
  };

  return (
    <div
      style={{
        background: C.bg,
        color: C.text,
        minHeight: "100vh",
        fontFamily: "'Vazirmatn', Tahoma, sans-serif",
      }}
    >
      <style>{`
        input[type="range"] { -webkit-appearance:none; appearance:none; background:transparent; }
        input[type="range"]::-webkit-slider-runnable-track { height:4px; background:${C.border}; border-radius:2px; }
        input[type="range"]::-webkit-slider-thumb { -webkit-appearance:none; appearance:none; width:13px; height:13px; border-radius:50%; background:${C.yellow}; margin-top:-4.5px; cursor:pointer; }
        .frame-card:hover { border-color: ${C.yellow} !important; }
        ::-webkit-scrollbar { height: 8px; width: 8px; }
        ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 4px; }
        @media (max-width: 640px) { .app-title { font-size: 22px !important; } }
      `}</style>

      {/* header */}
      <div
        style={{
          borderBottom: `1px solid ${C.border}`,
          padding: "18px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Film size={26} color={C.yellow} />
          <div>
            <div className="app-title" style={{ fontSize: 26, fontWeight: 800, letterSpacing: 0.3 }}>
              فیلم پلاس
            </div>
            <div style={{ fontSize: 12, color: C.muted }}>
              MoviePluss — تمرین زبان با فیلم؛ جمله به جمله، تکرار به تکرار
            </div>
          </div>
        </div>
        <button
          onClick={() => setPanelOpen((p) => !p)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: C.card,
            border: `1px solid ${C.border}`,
            color: C.text,
            borderRadius: 8,
            padding: "8px 12px",
            cursor: "pointer",
            fontSize: 13,
            fontFamily: "inherit",
          }}
        >
          <Upload size={15} />
          فایل‌ها
          {panelOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>
      </div>

      {/* upload panel */}
      {panelOpen && (
        <div
          style={{
            padding: "16px 20px",
            background: C.panel,
            borderBottom: `1px solid ${C.border}`,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 16,
          }}
        >
          <div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>
              ۱. فیلم (ویدیو محلی شما)
            </div>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: C.card,
                border: `1px dashed ${C.border}`,
                borderRadius: 8,
                padding: "10px 12px",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              <Upload size={15} color={C.yellow} />
              {videoName || "انتخاب فایل ویدیو..."}
              <input type="file" accept="video/*" onChange={onVideoFile} style={{ display: "none" }} />
            </label>
          </div>

          <div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>
              ۲. زیرنویس انگلیسی (srt / vtt)
            </div>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: C.card,
                border: `1px dashed ${C.border}`,
                borderRadius: 8,
                padding: "8px 12px",
                cursor: "pointer",
                fontSize: 12.5,
                marginBottom: 6,
              }}
            >
              <Upload size={14} color={C.yellow} />
              بارگذاری فایل EN
              <input
                type="file"
                accept=".srt,.vtt,text/plain"
                onChange={(e) => e.target.files?.[0] && onSubFile(e.target.files[0], "en")}
                style={{ display: "none" }}
              />
            </label>
            <select
              value={enEncoding}
              onChange={(e) => onEncodingChange("en", e.target.value)}
              style={{
                width: "100%",
                marginBottom: 6,
                background: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: 6,
                color: C.text,
                fontSize: 11.5,
                padding: 6,
                fontFamily: "inherit",
              }}
            >
              {ENCODINGS.map((o) => (
                <option key={o.value} value={o.value} style={{ background: C.card }}>
                  {o.label}
                </option>
              ))}
            </select>
            <textarea
              value={enText}
              onChange={(e) => setEnText(e.target.value)}
              placeholder="متن srt/vtt انگلیسی را اینجا جای‌گذاری کنید..."
              dir="ltr"
              style={{
                width: "100%",
                height: 60,
                background: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                color: C.text,
                fontSize: 12,
                padding: 8,
                resize: "vertical",
                fontFamily: "monospace",
              }}
            />
          </div>

          <div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>
              ۳. زیرنویس فارسی (srt / vtt)
            </div>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: C.card,
                border: `1px dashed ${C.border}`,
                borderRadius: 8,
                padding: "8px 12px",
                cursor: "pointer",
                fontSize: 12.5,
                marginBottom: 6,
              }}
            >
              <Upload size={14} color={C.teal} />
              بارگذاری فایل FA
              <input
                type="file"
                accept=".srt,.vtt,text/plain"
                onChange={(e) => e.target.files?.[0] && onSubFile(e.target.files[0], "fa")}
                style={{ display: "none" }}
              />
            </label>
            <select
              value={faEncoding}
              onChange={(e) => onEncodingChange("fa", e.target.value)}
              style={{
                width: "100%",
                marginBottom: 6,
                background: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: 6,
                color: C.text,
                fontSize: 11.5,
                padding: 6,
                fontFamily: "inherit",
              }}
            >
              {ENCODINGS.map((o) => (
                <option key={o.value} value={o.value} style={{ background: C.card }}>
                  {o.label}
                </option>
              ))}
            </select>
            <div style={{ fontSize: 10.5, color: C.muted, marginBottom: 6 }}>
              رمزگذاری فایل به‌طور خودکار تشخیص داده می‌شود. اگر باز هم متن به‌هم‌ریخته دیدید،
              از این منو Windows-1256 را دستی انتخاب کنید.
            </div>
            <textarea
              value={faText}
              onChange={(e) => setFaText(e.target.value)}
              placeholder="متن srt/vtt فارسی را اینجا جای‌گذاری کنید..."
              dir="rtl"
              style={{
                width: "100%",
                height: 60,
                background: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                color: C.text,
                fontSize: 12.5,
                padding: 8,
                resize: "vertical",
              }}
            />
          </div>

          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button
              onClick={applySubtitles}
              style={{
                width: "100%",
                background: C.yellow,
                color: "#1a1a1a",
                border: "none",
                borderRadius: 8,
                padding: "10px 14px",
                fontWeight: 700,
                fontSize: 13.5,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              اعمال زیرنویس‌ها ({enCueCount} / {faCueCount} جمله)
            </button>
          </div>
        </div>
      )}

      {!videoUrl ? (
        <div style={{ padding: 60, textAlign: "center", color: C.muted }}>
          برای شروع، یک فایل ویدیویی از دستگاه خود انتخاب کنید.
        </div>
      ) : (
        <div style={{ maxWidth: 980, margin: "0 auto", padding: "20px" }}>
          {/* video stage */}
          <div
            style={{
              position: "relative",
              background: "#000",
              borderRadius: 12,
              overflow: "hidden",
              border: `1px solid ${C.border}`,
            }}
          >
            <video
              ref={videoRef}
              src={videoUrl}
              onTimeUpdate={onTimeUpdate}
              onSeeked={onSeeked}
              onLoadedMetadata={(e) => setDuration(e.target.duration)}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              style={{ width: "100%", display: "block", maxHeight: "56vh", background: "#000" }}
            />

            {/* word translation popup */}
            {wordPopup && (
              <div
                style={{
                  position: "absolute",
                  top: 10,
                  insetInlineStart: 10,
                  background: "rgba(10,11,16,0.92)",
                  border: `1px solid ${C.teal}`,
                  borderRadius: 8,
                  padding: "8px 12px",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  zIndex: 5,
                  maxWidth: "80%",
                }}
              >
                <div>
                  <div style={{ fontSize: 13, color: C.yellow, fontWeight: 700 }}>
                    {wordPopup.word}
                  </div>
                  <div dir="rtl" style={{ fontSize: 13, color: C.teal, marginTop: 2 }}>
                    {wordPopup.loading ? "در حال دریافت ترجمه..." : wordPopup.translation}
                  </div>
                </div>
                <button
                  onClick={() => setWordPopup(null)}
                  style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer", padding: 0 }}
                >
                  <X size={14} />
                </button>
              </div>
            )}

            {/* subtitle overlay */}
            {activeCue && (
              <div
                style={{
                  position: "absolute",
                  bottom: 14,
                  left: 0,
                  right: 0,
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
                      background: "rgba(0,0,0,0.72)",
                      color: C.yellow,
                      fontSize: 17,
                      fontWeight: 600,
                      padding: "4px 12px",
                      borderRadius: 6,
                      textAlign: "center",
                      maxWidth: "90%",
                    }}
                  >
                    {renderClickableEn(activeCue.en, "overlay")}
                  </div>
                )}
                {showFa && activeCue.fa && (
                  <div
                    dir="rtl"
                    style={{
                      background: "rgba(0,0,0,0.72)",
                      color: C.teal,
                      fontSize: 17,
                      fontWeight: 600,
                      padding: "4px 12px",
                      borderRadius: 6,
                      textAlign: "center",
                      maxWidth: "90%",
                      pointerEvents: "none",
                    }}
                  >
                    {activeCue.fa}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* progress — اصلاح #۲: mouseDown/mouseUp برای جلوگیری از تداخل با تکرار */}
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
            style={{ width: "100%", marginTop: 12 }}
          />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 11,
              color: C.muted,
              marginTop: -4,
            }}
          >
            <span>{fmt(current)}</span>
            <span>{fmt(duration)}</span>
          </div>

          {/* controls */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              marginTop: 14,
              flexWrap: "wrap",
            }}
          >
            <IconBtn onClick={nextSentence} title="جمله بعد (→)">
              <SkipForward size={18} />
            </IconBtn>
            <IconBtn onClick={playPause} big title="پخش/توقف (Space)">
              {isPlaying ? <Pause size={22} /> : <Play size={22} />}
            </IconBtn>
            <IconBtn onClick={prevSentence} title="جمله قبل (←)">
              <SkipBack size={18} />
            </IconBtn>
            <IconBtn onClick={replaySentence} title="تکرار همین جمله (R)">
              <RotateCcw size={18} />
            </IconBtn>
            <button
              onClick={() => setRepeatOn((r) => !r)}
              title="وقتی فعال باشد، همین جمله را تا انتخاب «جمله بعد» بی‌وقفه تکرار می‌کند"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                height: 40,
                borderRadius: 20,
                padding: "0 14px",
                border: `1px solid ${repeatOn ? C.yellow : C.border}`,
                background: repeatOn ? "rgba(242,201,76,0.15)" : C.card,
                color: repeatOn ? C.yellow : C.text,
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 700,
                fontFamily: "inherit",
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
                background: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: 20,
                padding: "6px 12px",
              }}
            >
              <Gauge size={15} color={C.muted} />
              <select
                value={rate}
                onChange={(e) => setRate(Number(e.target.value))}
                style={{
                  background: "transparent",
                  color: C.text,
                  border: "none",
                  fontSize: 13,
                  fontFamily: "inherit",
                }}
              >
                {[0.5, 0.75, 1, 1.25, 1.5].map((r) => (
                  <option key={r} value={r} style={{ background: C.card }}>
                    {r}x
                  </option>
                ))}
              </select>
            </div>
            <ToggleChip
              label="EN"
              active={showEn}
              color={C.yellow}
              onClick={() => setShowEn((s) => !s)}
            />
            <ToggleChip
              label="FA"
              active={showFa}
              color={C.teal}
              onClick={() => setShowFa((s) => !s)}
            />
          </div>

          <div style={{ textAlign: "center", fontSize: 11, color: C.muted, marginTop: 6 }}>
            نکته: روی هر کلمه انگلیسی در زیرنویس کلیک کنید تا ترجمه‌اش نمایش داده شود.
          </div>

          {/* filmstrip */}
          {cues.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>
                نماها ({cues.length}) — روی هرکدام بزنید تا از همان‌جا پخش شود
              </div>
              <div
                ref={stripRef}
                style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 10 }}
              >
                {cues.map((c, i) => (
                  <div
                    key={i}
                    data-frame={i}
                    onClick={() => jumpTo(i, true)}
                    className="frame-card"
                    style={{
                      minWidth: 210,
                      maxWidth: 210,
                      background: i === currentIndex ? C.cardActive : C.card,
                      border: `1px solid ${i === currentIndex ? C.yellow : C.border}`,
                      borderRadius: 10,
                      padding: "8px 10px",
                      cursor: "pointer",
                      flexShrink: 0,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: 10,
                        color: C.muted,
                        marginBottom: 6,
                      }}
                    >
                      <span>نما {String(c.index).padStart(2, "0")}</span>
                      <span>{fmt(c.start)}</span>
                    </div>
                    {c.en && (
                      <div style={{ fontSize: 12.5, color: C.yellow, marginBottom: 4, lineHeight: 1.4 }}>
                        {renderClickableEn(c.en, `strip-${i}`)}
                      </div>
                    )}
                    {c.fa && (
                      <div dir="rtl" style={{ fontSize: 12.5, color: C.teal, lineHeight: 1.5 }}>
                        {c.fa}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function IconBtn({ children, onClick, title, active, big }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: big ? 52 : 40,
        height: big ? 52 : 40,
        borderRadius: "50%",
        border: `1px solid ${active ? C.yellow : C.border}`,
        background: active ? "rgba(242,201,76,0.15)" : C.card,
        color: active ? C.yellow : C.text,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
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
        borderRadius: 20,
        padding: "6px 14px",
        fontSize: 12,
        fontWeight: 700,
        border: `1px solid ${active ? color : C.border}`,
        background: active ? `${color}22` : C.card,
        color: active ? color : C.muted,
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      {label}
    </button>
  );
}
