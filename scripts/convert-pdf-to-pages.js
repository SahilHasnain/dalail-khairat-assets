const fs = require("fs");
const path = require("path");
const { convert } = require("pdf-poppler");

const ROOT_DIR = path.join(__dirname, "..");
const PAGES_DIR = path.join(ROOT_DIR, "pages");
const MANIFEST_PATH = path.join(ROOT_DIR, "manifests", "dalail.json");
const DEFAULT_PDF_PATH = "C:/Users/MDSAHI~1/Downloads/dalail-ul-kherait.pdf";

function getArgument(name, fallback) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : fallback;
}

async function emptyDirectory(directory) {
  await fs.promises.rm(directory, { recursive: true, force: true });
  await fs.promises.mkdir(directory, { recursive: true });
}

async function main() {
  const pdfPath = path.resolve(getArgument("pdf", DEFAULT_PDF_PATH));

  if (!fs.existsSync(pdfPath)) {
    throw new Error(`PDF not found: ${pdfPath}`);
  }

  await emptyDirectory(PAGES_DIR);

  await convert(pdfPath, {
    format: "png",
    out_dir: PAGES_DIR,
    out_prefix: "page",
    page: null,
    scale: 1200,
  });

  const pngFiles = (await fs.promises.readdir(PAGES_DIR))
    .filter((file) => file.toLowerCase().endsWith(".png"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  for (let index = 0; index < pngFiles.length; index += 1) {
    const pageNumber = String(index + 1).padStart(3, "0");
    const currentPath = path.join(PAGES_DIR, pngFiles[index]);
    const nextPath = path.join(PAGES_DIR, `page-${pageNumber}.png`);

    if (currentPath !== nextPath) {
      await fs.promises.rename(currentPath, nextPath);
    }

    console.log(`Prepared page ${index + 1}/${pngFiles.length}`);
  }

  const manifest = JSON.parse(await fs.promises.readFile(MANIFEST_PATH, "utf8"));
  manifest.version = new Date().toISOString().slice(0, 10);
  manifest.totalPages = pngFiles.length;
  await fs.promises.writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`Converted ${pngFiles.length} pages to ${PAGES_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
