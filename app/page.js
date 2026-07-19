'use client';

import { useState, useRef, useEffect } from 'react';

export default function Home() {
  // حالت‌های برنامه
  const [apiKey, setApiKey] = useState('');
  const [videoFile, setVideoFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [subtitles, setSubtitles] = useState([]);
  const [currentSubIndex, setCurrentSubIndex] = useState(0);
  const [autoRepeat, setAutoRepeat] = useState(false);

  const videoRef = useRef(null);
  const fileInputRef = useRef(null);

  // تابع استخراج و ترجمه زیرنویس‌ها
  const generateSubtitles = async () => {
    if (!videoFile || !apiKey) {
      alert('لطفاً کلید API اپن‌ای و فایل ویدیو را وارد کنید.');
      return;
    }

    setIsLoading(true);
    try {
      // 1. ارسال فایل به OpenAI Whisper برای دریافت زیرنویس انگلیسی (فرمت SRT)
      const formData = new FormData();
      formData.append('file', videoFile);
      formData.append('model', 'whisper-1');
      formData.append('response_format', 'srt');
      formData.append('language', 'en'); // تشخیص انگلیسی

      const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: formData,
      });

      if (!whisperRes.ok) {
        const err = await whisperRes.json();
        throw new Error(err.error?.message || 'خطا در ارتباط با OpenAI');
      }

      const srtText = await whisperRes.text();
      console.log('SRT دریافت شد:', srtText);

      // 2. پارس کردن فایل SRT به آرایه‌ای از بخش‌ها
      const segments = parseSRT(srtText);
      if (segments.length === 0) {
        throw new Error('هیچ زیرنویسی در فایل پیدا نشد.');
      }

      // 3. ترجمه هر بخش به فارسی با استفاده از Google Translate API (مرورگر)
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

  // تابع پارسر SRT
  const parseSRT = (srt) => {
    const blocks = srt.trim().split(/\n\s*\n/);
    const result = [];
    for (const block of blocks) {
      const lines = block.split('\n');
      if (lines.length < 3) continue;
      const index = parseInt(lines[0], 10);
      const timeLine = lines[1];
      const text = lines.slice(2).join('\n').trim();
      const timeMatch = timeLine.match(/(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})/);
      if (!timeMatch) continue;
      const toSeconds = (timeStr) => {
        const [h, m, s] = timeStr.split(':');
        const [sec, ms] = s.split(',');
        return parseInt(h, 10) * 3600 + parseInt(m, 10) * 60 + parseInt(sec, 10) + parseInt(ms, 10) / 1000;
      };
      result.push({
        index,
        start: toSeconds(timeMatch[1]),
        end: toSeconds(timeMatch[2]),
        text,
        persian: '',
      });
    }
    return result;
  };

  // تابع ترجمه با Google Translate (رایگان و در مرورگر)
  const translateText = async (text) => {
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=fa&dt=t&q=${encodeURIComponent(text)}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data && data[0] && data[0][0]) {
        return data[0][0][0];
      }
      return text; // در صورت خطا، خود متن انگلیسی برگردانده شود
    } catch {
      return text;
    }
  };

  // مدیریت پخش و تکرار خودکار
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      if (subtitles.length === 0) return;
      const currentTime = video.currentTime;
      let activeIndex = subtitles.findIndex(
        (sub) => currentTime >= sub.start && currentTime < sub.end
      );

      // اگر بین دو زیرنویس افتادیم، به آخرین زیرنویس فعال بچسبیم
      if (activeIndex === -1 && currentSubIndex < subtitles.length) {
        const next = subtitles[currentSubIndex];
        if (currentTime >= next.end) {
          // رسیدیم به انتهای بخش فعلی
          if (autoRepeat) {
            // حالت تکرار: برمی‌گردیم به ابتدای همین بخش
            video.currentTime = next.start;
            video.play();
          } else {
            // حالت عادی: اگر بخش بعدی وجود داشت، نشانگر را ببر جلو
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

  // رفتن به بخش بعدی با کلیک کاربر
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

  // آپلود فایل
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setVideoFile(file);
      const url = URL.createObjectURL(file);
      setVideoUrl(url);
      setSubtitles([]); // ریست زیرنویس‌ها
      setCurrentSubIndex(0);
    }
  };

  return (
    <div style={{ maxWidth: '900px', margin: '20px auto', padding: '20px' }}>
      <h1 style={{ textAlign: 'center' }}>🎬 فیلم پلاس | MoviePluss</h1>

      {/* بخش تنظیمات و آپلود */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', marginBottom: '20px', padding: '15px', border: '1px solid #ddd', borderRadius: '12px' }}>
        <div style={{ flex: 1, minWidth: '200px' }}>
          <label>🔑 کلید API اپن‌ای (OpenAI):</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
            style={{ width: '100%', padding: '8px', marginTop: '5px' }}
          />
        </div>
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

      {/* پخش‌کننده ویدیو */}
      {videoUrl && (
        <div style={{ position: 'relative', background: '#000', borderRadius: '12px', overflow: 'hidden' }}>
          <video
            ref={videoRef}
            src={videoUrl}
            controls
            style={{ width: '100%', display: 'block' }}
          />
          {/* نمایش زیرنویس هم‌زمان (اوورلی) */}
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

      {/* کنترل‌های تکرار و بخش بعدی */}
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

      {/* نمایش لیست زیرنویس‌ها (برای دیباگ یا مرور) */}
      {subtitles.length > 0 && (
        <details style={{ marginTop: '30px', padding: '15px', background: '#f9f9f9', borderRadius: '8px' }}>
          <summary>📜 مشاهده همه زیرنویس‌ها</summary>
          <div style={{ maxHeight: '300px', overflowY: 'auto', fontSize: '0.9rem' }}>
            {subtitles.map((sub, idx) => (
              <div key={idx} style={{ borderBottom: '1px solid #ddd', padding: '8px 0' }}>
                <strong>{sub.start.toFixed(1)}s - {sub.end.toFixed(1)}s</strong>:
                <span style={{ marginRight: '10px', color: '#1a73e8' }}>{sub.persian}</span>
                <span style={{ color: '#666', marginRight: '10px' }}>({sub.text})</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
