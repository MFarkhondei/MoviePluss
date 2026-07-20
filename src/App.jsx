import React, { useCallback, useEffect, useRef, useState } from "react";
import { Play, Pause, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";

const App = () => {
  const videoRef = useRef(null);
  const cardsViewportRef = useRef(null);
  const cardRefs = useRef([]);

  const [videoUrl, setVideoUrl] = useState("");
  const [cues, setCues] = useState([]);
  const [currentCueIndex, setCurrentCueIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  const currentCueRef = useRef(-1);

  // ====================== تابع مرکزی کردن کارت فعال ======================
  const centerActiveCard = useCallback((smooth = true) => {
    const viewport = cardsViewportRef.current;
    const activeCard = cardRefs.current[currentCueRef.current];

    if (!viewport || !activeCard || currentCueRef.current < 0) return;

    const viewportWidth = viewport.clientWidth;
    const cardWidth = activeCard.offsetWidth;
    const cardLeft = activeCard.offsetLeft;

    // محاسبه موقعیت دقیق وسط
    const targetScroll =
      cardLeft - (viewportWidth / 2) + (cardWidth / 2);

    const maxScroll = viewport.scrollWidth - viewport.clientWidth;
    const finalScroll = Math.max(0, Math.min(targetScroll, maxScroll));

    viewport.scrollTo({
      left: finalScroll,
      behavior: smooth ? "smooth" : "auto",
    });
  }, []);

  // هر بار که کارت فعال تغییر کرد، اسکرول خودکار به وسط
  useEffect(() => {
    const timer = setTimeout(() => {
      centerActiveCard(true);
    }, 50);

    return () => clearTimeout(timer);
  }, [currentCueIndex, centerActiveCard]);

  // تنظیم مجدد اسکرول هنگام تغییر اندازه
  useEffect(() => {
    const handleResize = () => centerActiveCard(false);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [centerActiveCard]);

  // ====================== مدیریت ویدیو ======================
  const handleVideoFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (videoUrl) URL.revokeObjectURL(videoUrl);
    const url = URL.createObjectURL(file);
    setVideoUrl(url);
    setCurrentCueIndex(-1);
    currentCueRef.current = -1;
  };

  // ====================== زیرنویس نمونه (برای تست) ======================
  const loadSampleSubtitles = () => {
    const sampleCues = [
      { id: 0, start: 5, end: 9, english: "Hey, how's it going?", persian: "سلام، حالتو چطوره؟" },
      { id: 1, start: 10, end: 14, english: "I'm doing pretty good.", persian: "من حالم خوبه." },
      { id: 2, start: 15, end: 19, english: "What about you?", persian: "تو چی؟" },
      { id: 3, start: 20, end: 24, english: "I've been really busy lately.", persian: "اخیراً خیلی سرم شلوغ بوده." },
      { id: 4, start: 25, end: 29, english: "We should hang out soon.", persian: "باید زودتر با هم وقت بگذرونیم." },
      { id: 5, start: 30, end: 34, english: "Yeah, that sounds great.", persian: "آره، عالی به نظر می‌رسه." },
    ];
    setCues(sampleCues);
    setCurrentCueIndex(-1);
  };

  // ====================== کنترل پخش ======================
  const goToCard = (index, play = true) => {
    const cue = cues[index];
    if (!cue || !videoRef.current) return;

    videoRef.current.currentTime = cue.start;
    currentCueRef.current = index;
    setCurrentCueIndex(index);

    if (play) {
      videoRef.current.play().catch(() => {});
    }
  };

  const goToNext = () => {
    const next = currentCueRef.current + 1;
    if (next < cues.length) goToCard(next, true);
  };

  const goToPrevious = () => {
    const prev = currentCueRef.current - 1;
    if (prev >= 0) goToCard(prev, true);
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
    } else {
      videoRef.current.pause();
    }
  };

  const replayCurrent = () => {
    if (currentCueIndex >= 0) goToCard(currentCueIndex, true);
  };

  // ====================== آپدیت زمان ======================
  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const time = videoRef.current.currentTime;
    setCurrentTime(time);

    const foundIndex = cues.findIndex(
      (cue) => time >= cue.start && time < cue.end
    );

    if (foundIndex !== -1 && foundIndex !== currentCueRef.current) {
      currentCueRef.current = foundIndex;
      setCurrentCueIndex(foundIndex);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  // ====================== استایل مشابه Language Reactor ======================
  return (
    <div dir="rtl" style={{ backgroundColor: "#0f0f0f", minHeight: "100vh", color: "white", fontFamily: "system-ui, sans-serif" }}>
      {/* هدر */}
      <div style={{ 
        height: 52, 
        backgroundColor: "#1a1a1a", 
        display: "flex", 
        alignItems: "center", 
        padding: "0 16px",
        borderBottom: "1px solid #2a2a2a"
      }}>
        <span style={{ fontSize: 15, fontWeight: 500 }}>Language Reactor</span>
      </div>

      {/* ویدیو */}
      <div style={{ backgroundColor: "#000", padding: "8px" }}>
        {!videoUrl ? (
          <div 
            onClick={() => document.getElementById("video-input").click()}
            style={{
              height: 220,
              backgroundColor: "#1f1f1f",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "column",
              cursor: "pointer",
              borderRadius: 8
            }}
          >
            <p>برای انتخاب فیلم کلیک کنید</p>
            <input 
              id="video-input" 
              type="file" 
              accept="video/*" 
              hidden 
              onChange={handleVideoFile} 
            />
          </div>
        ) : (
          <video
            ref={videoRef}
            src={videoUrl}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            style={{ width: "100%", maxHeight: "320px", borderRadius: 8 }}
            controls={false}
          />
        )}
      </div>

      {/* بخش کارت‌ها (وسط صفحه) */}
      {cues.length > 0 && (
        <div style={{ 
          backgroundColor: "#121212", 
          padding: "12px 0",
          borderTop: "1px solid #2a2a2a",
          borderBottom: "1px solid #2a2a2a"
        }}>
          <div style={{ padding: "0 16px 8px", fontSize: 13, color: "#888" }}>
            زیرنویس‌ها
          </div>

          <div
            ref={cardsViewportRef}
            style={{
              overflowX: "auto",
              overflowY: "hidden",
              paddingBottom: 8,
              scrollBehavior: "smooth",
            }}
          >
            <div style={{ 
              display: "flex", 
              gap: "10px", 
              padding: "0 16px",
              width: "max-content"
            }}>
              {cues.map((cue, index) => (
                <div
                  key={index}
                  ref={(el) => (cardRefs.current[index] = el)}
                  onClick={() => goToCard(index)}
                  style={{
                    minWidth: "220px",
                    maxWidth: "220px",
                    backgroundColor: currentCueIndex === index ? "#2a2a3a" : "#1f1f1f",
                    border: currentCueIndex === index ? "1.5px solid #7c3aed" : "1px solid #2a2a2a",
                    borderRadius: 10,
                    padding: "12px 14px",
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                >
                  <div style={{ fontSize: 11, color: "#888", marginBottom: 6 }}>
                    {Math.floor(cue.start)}s
                  </div>
                  <div style={{ color: "#f4d35e", fontSize: 13, lineHeight: 1.4 }}>
                    {cue.english}
                  </div>
                  <div style={{ color: "#4ade80", fontSize: 13, marginTop: 6, lineHeight: 1.4 }}>
                    {cue.persian}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* کنترل‌ها در پایین */}
      <div style={{
        position: "sticky",
        bottom: 0,
        backgroundColor: "#1a1a1a",
        padding: "12px 16px",
        borderTop: "1px solid #2a2a2a",
        display: "flex",
        alignItems: "center",
        gap: "12px",
        zIndex: 10
      }}>
        <button 
          onClick={goToPrevious}
          style={{ background: "none", border: "none", color: "white", padding: 8 }}
        >
          <ChevronLeft size={26} />
        </button>

        <button 
          onClick={togglePlay}
          style={{
            backgroundColor: "#7c3aed",
            border: "none",
            color: "white",
            width: 52,
            height: 52,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          {isPlaying ? <Pause size={26} /> : <Play size={26} />}
        </button>

        <button 
          onClick={goToNext}
          style={{ background: "none", border: "none", color: "white", padding: 8 }}
        >
          <ChevronRight size={26} />
        </button>

        <button 
          onClick={replayCurrent}
          style={{ background: "none", border: "none", color: "#aaa", marginLeft: "auto" }}
        >
          <RotateCcw size={22} />
        </button>

        <button 
          onClick={loadSampleSubtitles}
          style={{ 
            backgroundColor: "#2a2a2a", 
            color: "white", 
            border: "none", 
            padding: "8px 14px", 
            borderRadius: 6,
            fontSize: 13
          }}
        >
          زیرنویس نمونه
        </button>
      </div>
    </div>
  );
};

export default App;
