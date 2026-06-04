# OCR Setup

The Dalail PDF is image-based, so weekday/part boundaries need OCR or manual image inspection.

## Required Tool

Install Tesseract OCR. The script auto-detects `C:\Program Files\Tesseract-OCR\tesseract.exe` on Windows if `tesseract` is not in `PATH`.

Recommended language packs:

- `ara` for Arabic
- `urd` for Urdu
- `eng` as fallback

Language files may be installed system-wide or placed locally in this repo under `tessdata/`.

Check installation:

```bash
tesseract --version
tesseract --list-langs
```

## Run Boundary Detection

After PNG pages exist in `pages/`, run:

```bash
npm run ocr:weekdays -- --lang=urd+ara
```

Useful options:

```bash
npm run ocr:weekdays -- --start=1 --end=40 --lang=urd+ara
npm run ocr:weekdays -- --psm=6 --concurrency=2 --lang=urd+ara
```

Outputs:

- OCR text files in `ocr-output/`
- Candidate report in `ocr-output/weekday-candidates.json`

## What To Validate

OCR candidates must be manually checked against the page images because headings can appear in a table of contents.

Search targets include:

- Arabic: `الاثنين`, `الثلاثاء`, `الأربعاء`, `الخميس`, `الجمعة`, `السبت`, `الأحد`
- Urdu: `پیر`, `منگل`, `بدھ`, `جمعرات`, `جمعہ`, `ہفتہ`, `اتوار`
- Urdu/Persian variants: `دوشنبہ`, `سہ شنبہ`, `چہار شنبہ`, `پنج شنبہ`, `شنبہ`, `یک شنبہ`
- Structure words: `حزب`, `ورد`, `يوم`, `روز`

## Reading Method Reference

The common method is an 8-part weekly cycle:

- Day 1: Opening dua, Names of Allah, Names of the Prophet ﷺ, Dua of Intention, Part 1
- Day 2: Dua of Intention, Part 2
- Day 3: Dua of Intention, Part 3
- Day 4: Dua of Intention, Part 4
- Day 5: Dua of Intention, Part 5
- Day 6: Dua of Intention, Part 6
- Day 7: Dua of Intention, Part 7
- Day 8 / Day 1: Part 8, Dua of Completion, then restart Day 1

Source checked: `https://dalailalkhayrat.com/`
