'use client';

import { useState, useRef, useEffect } from 'react';

export default function Home() {
  const [videoFile, setVideoFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [subtitles, setSubtitles] = useState([]);
  const [currentSubIndex, setCurrentSubIndex] = useState(0);
  const [autoRepeat, setAutoRepeat] = useState(false);

  const videoRef = useRef(null);
  const fileInputRef = useRef(null);

  // تابع ترجمه با Google Translate (همان قبلی)
  const translateText = async (text) => {
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=fa&dt=t&q=${encodeURIComponent(text)}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data && data[0] && data[0][0]) {
        return data[0][0][0];
      }
      return text;
    } catch {
      return text;
    }
  };

  // ========== تابع تولید زیرنویس با browser-whisper ==========
  const generateSubtitles = async () => {
    if (!videoFile) {
      alert('لطفاً فایل ویدیو را انتخاب کنید.');
      return;
    }

    // فقط در مرورگر اجرا شود (نه در سرور)
    if (typeof window === 'undefined') {
      alert('این قابلیت فقط در مرورگر کار می‌کند.');
      return;
    }

    setIsLoading(true);
    try {
      // بارگذاری پویای کتابخانه (فقط در کلاینت)
      const { transcribe } = await import('browser-whisper');

      const result = await transcribe(videoFile, {
        model: 'tiny', // 'tiny' سبک‌ترین و سریع‌ترین گزینه
        language: 'en',
        onProgress: (progress) => console.log(`پیشرفت: ${Math.round(progress)}%`),
      });

      if (!result.segments || result.segments.length === 0) {
        throw new Error('هیچ متنی تشخیص داده نشد.');
      }

      const segments = result.segments.map((seg, index) => ({
        index: index + 1,
        start: seg.start,
        end: seg.end,
        text: seg.text.trim(),
        persian: '',
      }));

      // ترجمه به فارسی
      const translatedSegments = await Promise.all(
        segments.map(async (seg) => {
          const persianText = await translateText(seg.text);
          return { ...seg, persian: persianText };
        })
      );

      setSubtitles(translatedSegments);
      setCurrentSubIndex(0);
      if (videoRef.current) {
        videoRef.current.currentTime = translatedSegments[0].start;
        videoRef.current.play();
      }
    } catch (error) {
      alert('خطا: ' + error.message);
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  // مدیریت پخش و تکرار خودکار (همان قبلی)
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      if (subtitles.length === 0) return;
      const currentTime = video.currentTime;
      let activeIndex = subtitles.findIndex(
        (sub) => currentTime >= sub.start && currentTime < sub.end
      );

      if (activeIndex === -1 && currentSubIndex < subtitles.length) {
        const next = subtitles[currentSubIndex];
        if (currentTime >= next.end) {
          if (autoRepeat) {
            video.currentTime = next.start;
            video.play();
          } else {
            if (currentSubIndex + 1 < subtitles.length) {
              setCurrentSubIndex(currentSubIndex + 1);
            }
          }
        }
        return;
      }

      if (activeIndex !== -1 && activeIndex !== currentSubIndex) {
        setCurrentSubIndex(activeIndex);
      }
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    return () => video.removeEventListener('timeupdate', handleTimeUpdate);
  }, [subtitles, currentSubIndex, autoRepeat]);

  const goToNextSegment = () => {
    if (!videoRef.current || subtitles.length === 0) return;
    const nextIndex = currentSubIndex + 1;
    if (nextIndex < subtitles.length) {
      setCurrentSubIndex(nextIndex);
      videoRef.current.currentTime = subtitles[nextIndex].start;
      videoRef.current.play();
    } else {
      alert('به انتهای ویدیو رسیدید!');
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setVideoFile(file);
      const url = URL.createObjectURL(file);
      setVideoUrl(url);
      setSubtitles([]);
      setCurrentSubIndex(0);
    }
  };

  return (
    <div style={{ maxWidth: '900px', margin: '20px auto', padding: '20px' }}>
      <h1 style={{ textAlign: 'center' }}>🎬 فیلم پلاس | MoviePluss</h1>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', marginBottom: '20px', padding: '15px', border: '1px solid #ddd', borderRadius: '12px' }}>
        <div style={{ flex: 1, minWidth: '200px' }}>
          <label>📁 انتخاب فایل (ویدیو/صوت):</label>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="video/*,audio/*"
            style={{ display: 'block', marginTop: '5px' }}
          />
        </div>
        <button
          onClick={generateSubtitles}
          disabled={isLoading || !videoFile}
          style={{ padding: '10px 25px', background: '#0070f3', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', alignSelf: 'flex-end' }}
        >
          {isLoading ? '⏳ در حال پردازش...' : '⚡ تولید زیرنویس (انگلیسی+فارسی)'}
        </button>
      </div>

      {videoUrl && (
        <div style={{ position: 'relative', background: '#000', borderRadius: '12px', overflow: 'hidden' }}>
          <video
            ref={videoRef}
            src={videoUrl}
            controls
            style={{ width: '100%', display: 'block' }}
          />
          {subtitles.length > 0 && currentSubIndex < subtitles.length && (
            <div
              style={{
                position: 'absolute',
                bottom: '70px',
                left: '20%',
                right: '20%',
                textAlign: 'center',
                color: '#fff',
                fontSize: '1.6rem',
                fontWeight: 'bold',
                textShadow: '2px 2px 8px rgba(0,0,0,0.9)',
                background: 'rgba(0,0,0,0.5)',
                padding: '12px 20px',
                borderRadius: '10px',
                direction: 'rtl',
                pointerEvents: 'none',
              }}
            >
              <div style={{ color: '#ffd700' }}>{subtitles[currentSubIndex].persian}</div>
              <div style={{ fontSize: '1rem', color: '#ccc', marginTop: '5px' }}>
                {subtitles[currentSubIndex].text}
              </div>
            </div>
          )}
        </div>
      )}

      {subtitles.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginTop: '20px', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.1rem' }}>
            <input
              type="checkbox"
              checked={autoRepeat}
              onChange={(e) => setAutoRepeat(e.target.checked)}
              style={{ width: '20px', height: '20px' }}
            />
            🔁 تکرار خودکار بخش فعلی
          </label>
          <button
            onClick={goToNextSegment}
            style={{ padding: '10px 30px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}
          >
            ⏩ رفتن به بخش بعدی
          </button>
          <span style={{ fontSize: '0.9rem', color: '#555' }}>
            بخش {currentSubIndex + 1} از {subtitles.length}
          </span>
        </div>
      )}
    </div>
  );
}
