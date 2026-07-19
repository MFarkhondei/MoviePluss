  // ========== تابع جدید بدون نیاز به کلید OpenAI ==========
  const generateSubtitles = async () => {
    if (!videoFile) {
      alert('لطفاً فایل ویدیو را انتخاب کنید.');
      return;
    }

    setIsLoading(true);
    try {
      // بارگذاری پویا (برای جلوگیری از ارور در Next.js)
      const { transcribe } = await import('browser-whisper');

      // اجرای تشخیص گفتار مستقیم در مرورگر (کاملاً رایگان)
      const result = await transcribe(videoFile, {
        model: 'base', // گزینه‌ها: tiny, base, small, medium (هرچه بزرگ‌تر، دقیق‌تر ولی کندتر)
        language: 'en', // تشخیص زبان انگلیسی
        onProgress: (progress) => console.log(`پیشرفت: ${Math.round(progress)}%`),
      });

      console.log('نتیجه تشخیص گفتار:', result);

      if (!result.segments || result.segments.length === 0) {
        throw new Error('هیچ متنی در فایل صوتی تشخیص داده نشد.');
      }

      // تبدیل خروجی به فرمت مورد نظر برنامه
      const segments = result.segments.map((seg, index) => ({
        index: index + 1,
        start: seg.start,
        end: seg.end,
        text: seg.text.trim(),
        persian: '',
      }));

      // ترجمه هر بخش به فارسی (با همان سرویس گوگل که قبلاً داشتیم)
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
  // ========== پایان تابع جدید ==========
