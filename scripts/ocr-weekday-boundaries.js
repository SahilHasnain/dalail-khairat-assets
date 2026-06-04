const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync, spawn } = require("child_process");

const ROOT_DIR = path.join(__dirname, "..");
const PAGES_DIR = path.join(ROOT_DIR, "pages");
const OCR_DIR = path.join(ROOT_DIR, "ocr-output");
const LOCAL_TESSDATA_DIR = path.join(ROOT_DIR, "tessdata");
const WINDOWS_TESSERACT_PATH = "C:/Program Files/Tesseract-OCR/tesseract.exe";

const WEEKDAY_PATTERNS = [
  {
    id: "monday",
    title: "Monday",
    terms: ["پیر", "پير", "سوموار", "دوشنبہ", "دو شنبہ", "الاثنين", "الإثنين", "اثنين"],
  },
  {
    id: "tuesday",
    title: "Tuesday",
    terms: ["منگل", "سہ شنبہ", "سه شنبہ", "سہ شنبه", "سه شنبه", "الثلاثاء", "ثلاثاء"],
  },
  {
    id: "wednesday",
    title: "Wednesday",
    terms: ["بدھ", "بدھہ", "چہار شنبہ", "چہارشنبہ", "چهار شنبہ", "چهارشنبہ", "الأربعاء", "الاربعاء", "اربعاء"],
  },
  {
    id: "thursday",
    title: "Thursday",
    terms: ["جمعرات", "پنج شنبہ", "پنجشنبہ", "پنج شنبه", "الخميس", "خميس"],
  },
  {
    id: "friday",
    title: "Friday",
    terms: ["جمعہ", "جمعه", "الجمعة"],
  },
  {
    id: "saturday",
    title: "Saturday",
    terms: ["ہفتہ", "هفته", "سنیچر", "سنیچر", "شنبہ", "شنبه", "السبت", "سبت"],
  },
  {
    id: "sunday",
    title: "Sunday",
    terms: ["اتوار", "یک شنبہ", "یکشنبہ", "يك شنبہ", "يكشنبہ", "الأحد", "الاحد", "احد"],
  },
];

const EXTRA_PATTERNS = [
  {
    id: "hizb",
    title: "Hizb/Wird",
    terms: ["حزب", "ورد", "يوم", "روز", "حصہ", "جز", "پارۂ", "پارہ"],
  },
  {
    id: "opening",
    title: "Opening",
    terms: ["اسماء", "أسماء", "دلائل", "دلایل", "افتتاح", "مقدم", "opening"],
  },
];

function getArgument(name, fallback) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : fallback;
}

function parsePageNumber(filename) {
  const match = filename.match(/page-(\d+)\.png$/i);
  return match ? Number(match[1]) : null;
}

function getPageFiles() {
  if (!fs.existsSync(PAGES_DIR)) return [];
  return fs
    .readdirSync(PAGES_DIR)
    .filter((file) => /^page-\d+\.png$/i.test(file))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function getAvailableTesseractLanguages() {
  try {
    const output = execFileSync(getTesseractCommand(), getTesseractBaseArgs(["--list-langs"]), { encoding: "utf8" });
    return output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.toLowerCase().includes("list of available"));
  } catch (error) {
    return [];
  }
}

function getTesseractCommand() {
  if (fs.existsSync(WINDOWS_TESSERACT_PATH)) return WINDOWS_TESSERACT_PATH;
  return "tesseract";
}

function getTesseractBaseArgs(args) {
  if (fs.existsSync(LOCAL_TESSDATA_DIR)) {
    return ["--tessdata-dir", LOCAL_TESSDATA_DIR, ...args];
  }
  return args;
}

function chooseLanguage(requestedLanguage) {
  if (requestedLanguage) return requestedLanguage;

  const available = getAvailableTesseractLanguages();
  const preferred = ["urd", "ara", "eng"].filter((lang) => available.includes(lang));
  return preferred.length > 0 ? preferred.join("+") : "eng";
}

function runTesseract(imagePath, language, psm) {
  return new Promise((resolve) => {
    const args = getTesseractBaseArgs([imagePath, "stdout", "-l", language, "--psm", String(psm)]);
    const child = spawn(getTesseractCommand(), args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });

    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });

    child.on("error", (error) => {
      resolve({ code: 1, stdout: "", stderr: error.message });
    });
  });
}

function findMatches(text) {
  const normalized = text.toLowerCase();
  const patterns = [...WEEKDAY_PATTERNS, ...EXTRA_PATTERNS];
  const matches = [];

  for (const pattern of patterns) {
    const matchedTerms = pattern.terms.filter((term) => normalized.includes(term.toLowerCase()));
    if (matchedTerms.length > 0) {
      matches.push({ ...pattern, matchedTerms });
    }
  }

  return matches;
}

function getSnippet(text, terms) {
  const compact = text.replace(/\s+/g, " ").trim();
  const lowered = compact.toLowerCase();
  const firstIndex = terms
    .map((term) => lowered.indexOf(term.toLowerCase()))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];

  if (firstIndex === undefined) {
    return compact.slice(0, 180);
  }

  const start = Math.max(0, firstIndex - 70);
  return compact.slice(start, start + 220);
}

async function main() {
  const language = chooseLanguage(getArgument("lang", null));
  const psm = Number(getArgument("psm", "6"));
  const startPage = Number(getArgument("start", "1"));
  const endPageArg = getArgument("end", null);
  const concurrency = Math.max(1, Number(getArgument("concurrency", String(Math.max(1, Math.min(4, os.cpus().length - 1))))));

  const pageFiles = getPageFiles().filter((file) => {
    const page = parsePageNumber(file);
    if (!page) return false;
    if (page < startPage) return false;
    if (endPageArg && page > Number(endPageArg)) return false;
    return true;
  });

  if (pageFiles.length === 0) {
    console.log("No page PNG files found. Run `npm run convert` first.");
    return;
  }

  fs.mkdirSync(OCR_DIR, { recursive: true });

  console.log(`OCR language: ${language}`);
  console.log(`Pages: ${pageFiles.length}, concurrency: ${concurrency}, psm: ${psm}`);

  const results = [];
  let cursor = 0;

  async function worker() {
    while (cursor < pageFiles.length) {
      const file = pageFiles[cursor];
      cursor += 1;

      const page = parsePageNumber(file);
      const imagePath = path.join(PAGES_DIR, file);
      const outputPath = path.join(OCR_DIR, file.replace(/\.png$/i, ".txt"));
      const cachedText = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf8") : null;
      const text = cachedText ?? (await runTesseract(imagePath, language, psm)).stdout;

      if (!cachedText) {
        fs.writeFileSync(outputPath, text);
      }

      const matches = findMatches(text);
      if (matches.length > 0) {
        results.push({ page, file, matches, text });
        const labels = matches.map((match) => `${match.title} [${match.matchedTerms.join(", ")}]`).join("; ");
        console.log(`Page ${String(page).padStart(3, "0")}: ${labels}`);
      } else if (page % 10 === 0) {
        console.log(`Scanned page ${String(page).padStart(3, "0")}`);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  results.sort((a, b) => a.page - b.page);

  console.log("\nCandidate weekday boundaries:");
  for (const pattern of WEEKDAY_PATTERNS) {
    const candidates = results.filter((result) => result.matches.some((match) => match.id === pattern.id));
    const pages = candidates.map((candidate) => candidate.page);
    console.log(`${pattern.title}: ${pages.length > 0 ? pages.join(", ") : "none"}`);
  }

  const report = results.map((result) => ({
    page: result.page,
    file: result.file,
    matches: result.matches.map((match) => ({
      id: match.id,
      title: match.title,
      terms: match.matchedTerms,
      snippet: getSnippet(result.text, match.matchedTerms),
    })),
  }));

  fs.writeFileSync(path.join(OCR_DIR, "weekday-candidates.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\nSaved OCR text and report to ${OCR_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
