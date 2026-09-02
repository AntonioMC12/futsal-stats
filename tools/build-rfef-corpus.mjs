import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const root = resolve(import.meta.dirname, '..');
const manifestPath = resolve(root, 'public/rfef/manifest.json');
const chunksPath = resolve(root, 'public/rfef/chunks.json');
const command = process.argv[2];
let manifest;
let chunks;

const COMPLETE_RULES_DOCUMENT = {
  id: 'fifa-futsal-laws-2025-26',
  title: 'Reglas de Juego del Futsal 2025/2026 (texto íntegro publicado por la RFEF)',
  date: '2025-09-08',
  sourceUrl: 'https://rfef.es/sites/default/files/pdf/circulares/Circular_27_con_anexos.pdf',
};

const PAGE_SECTIONS = [
  [32, 'Observaciones sobre las Reglas de Juego del Futsal'],
  [37, 'Regla 1. El terreno de juego'],
  [50, 'Regla 2. El balón'],
  [53, 'Regla 3. Los jugadores'],
  [61, 'Regla 4. El equipamiento de los jugadores'],
  [68, 'Regla 5. Los árbitros'],
  [76, 'Regla 6. Los otros miembros del equipo arbitral'],
  [82, 'Regla 7. La duración del partido'],
  [86, 'Regla 8. Inicio y reanudación del juego'],
  [90, 'Regla 9. Balón en juego'],
  [92, 'Regla 10. El resultado de un partido'],
  [97, 'Regla 11. El fuera de juego'],
  [99, 'Regla 12. Faltas y conducta incorrecta'],
  [118, 'Regla 13. Tiros libres'],
  [129, 'Regla 14. El tiro penal'],
  [135, 'Regla 15. El saque de banda'],
  [138, 'Regla 16. El saque de meta'],
  [141, 'Regla 17. El saque de esquina'],
  [144, 'Protocolo de sistemas de revisión en vídeo'],
  [152, 'Directrices prácticas para árbitros de futsal'],
  [154, 'Directrices prácticas. Señales'],
  [167, 'Directrices prácticas. Posicionamiento'],
  [186, 'Interpretación de las reglas y otras recomendaciones'],
  [209, 'Términos de futsal'],
  [219, 'Términos arbitrales'],
];

const KEYWORD_STOP_WORDS = new Set([
  'ante',
  'como',
  'cuando',
  'desde',
  'donde',
  'entre',
  'esta',
  'este',
  'estos',
  'haber',
  'hacia',
  'hasta',
  'juego',
  'para',
  'pero',
  'podrá',
  'regla',
  'según',
  'sobre',
  'también',
  'tendrá',
  'todos',
  'tras',
]);

async function writeCorpus(nextManifest, nextChunks) {
  await mkdir(resolve(root, 'public/rfef'), { recursive: true });
  await Promise.all([
    writeFile(manifestPath, `${JSON.stringify(nextManifest, null, 2)}\n`),
    writeFile(chunksPath, `${JSON.stringify(nextChunks, null, 2)}\n`),
  ]);
}

async function extractCompleteFutsalRules(pdfPath) {
  const bytes = new Uint8Array(await readFile(pdfPath));
  const pdf = await getDocument({ data: bytes }).promise;
  if (pdf.numPages < 219) {
    throw new Error(
      `PDF incompleto: se esperaban al menos 219 páginas y contiene ${pdf.numPages}.`,
    );
  }
  const extracted = [];
  for (let pageNumber = 32; pageNumber <= 219; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = cleanPageText(
      content.items.map((item) => `${item.str}${item.hasEOL ? '\n' : ' '}`).join(''),
    );
    if (text.length < 40 || (text.length < 100 && !/[.;:]/.test(text))) continue;
    const section = sectionForPage(pageNumber);
    for (const [partIndex, part] of splitIntoChunks(text).entries()) {
      extracted.push({
        id: `lotg-2025-26-p${String(pageNumber).padStart(3, '0')}-${String(partIndex + 1).padStart(2, '0')}`,
        season: '2026/27',
        documentId: COMPLETE_RULES_DOCUMENT.id,
        documentTitle: COMPLETE_RULES_DOCUMENT.title,
        documentDate: COMPLETE_RULES_DOCUMENT.date,
        section: `${section} · página PDF ${pageNumber}`,
        page: pageNumber,
        text: part,
        keywords: extractKeywords(`${section} ${part}`),
        sourceUrl: COMPLETE_RULES_DOCUMENT.sourceUrl,
      });
    }
  }
  return extracted;
}

function cleanPageText(raw) {
  return raw
    .replace(/\u00a0/g, ' ')
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .map((line) => line.replace(/^\d{1,3}\s+Reglas de Juego del Futsal 2025\/26$/i, ''))
    .filter((line) => line && !/^Reglas de Juego del Futsal 2025\/26(?: \d+)?$/i.test(line))
    .filter((line) => !/^\d{1,3}$/.test(line))
    .join('\n')
    .replace(/^\d{1,3}\s+(?=Regla\s+\d+|Protocolo|Directrices|Términos)/i, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function sectionForPage(pageNumber) {
  return PAGE_SECTIONS.reduce(
    (current, [firstPage, section]) => (pageNumber >= firstPage ? section : current),
    PAGE_SECTIONS[0][1],
  );
}

function splitIntoChunks(text, maximumLength = 1400, overlapLength = 180) {
  const units = text
    .split(/\n+/)
    .flatMap((paragraph) =>
      paragraph.length <= maximumLength
        ? [paragraph]
        : (paragraph.match(new RegExp(`.{1,${maximumLength}}(?:\\s|$)`, 'gs')) ?? [paragraph]),
    )
    .map((unit) => unit.trim())
    .filter(Boolean);
  const result = [];
  let current = '';
  for (const unit of units) {
    if (!current || current.length + unit.length + 1 <= maximumLength) {
      current = current ? `${current}\n${unit}` : unit;
      continue;
    }
    result.push(current);
    const overlap = current.slice(-overlapLength).replace(/^\S*\s/, '');
    current = `${overlap}\n${unit}`.trim();
  }
  if (current) result.push(current);
  return result;
}

function extractKeywords(value) {
  const counts = new Map();
  const words = value
    .normalize('NFC')
    .toLocaleLowerCase('es')
    .match(/[a-záéíóúüñ0-9]{4,}/giu);
  for (const word of words ?? []) {
    if (KEYWORD_STOP_WORDS.has(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return [...counts]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'es'))
    .slice(0, 16)
    .map(([word]) => word);
}

function repairMojibake(value) {
  if (Array.isArray(value)) return value.map(repairMojibake);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, repairMojibake(item)]),
    );
  }
  if (typeof value !== 'string' || !/[ÃÂâ]/.test(value)) return value;
  return Buffer.from(value, 'latin1').toString('utf8');
}

function validate(manifestToValidate, chunksToValidate) {
  if (
    !Array.isArray(chunksToValidate) ||
    manifestToValidate.chunkCount !== chunksToValidate.length
  ) {
    throw new Error('El número de fragmentos no coincide con el manifiesto.');
  }
  const required = [
    'id',
    'season',
    'documentId',
    'documentTitle',
    'documentDate',
    'section',
    'text',
    'keywords',
    'sourceUrl',
  ];
  const ids = new Set();
  for (const [index, chunk] of chunksToValidate.entries()) {
    for (const field of required) {
      if (!(field in chunk)) throw new Error(`Fragmento ${index}: falta ${field}.`);
    }
    if (ids.has(chunk.id)) throw new Error(`ID de fragmento duplicado: ${chunk.id}.`);
    ids.add(chunk.id);
    if (
      chunk.season !== manifestToValidate.season ||
      !chunk.sourceUrl.startsWith('https://rfef.es/')
    ) {
      throw new Error(`Fragmento ${chunk.id}: temporada o fuente no válidas.`);
    }
  }
  const completeRules = chunksToValidate.filter(
    (chunk) => chunk.documentId === COMPLETE_RULES_DOCUMENT.id,
  );
  if (manifestToValidate.documents.some((document) => document.id === COMPLETE_RULES_DOCUMENT.id)) {
    const totalCharacters = completeRules.reduce((total, chunk) => total + chunk.text.length, 0);
    if (totalCharacters < 250_000) {
      throw new Error(
        `Reglamento completo: extracción insuficiente (${totalCharacters} caracteres).`,
      );
    }
    for (let rule = 1; rule <= 17; rule += 1) {
      if (!completeRules.some((chunk) => chunk.section.startsWith(`Regla ${rule}.`))) {
        throw new Error(`Reglamento completo: falta la Regla ${rule}.`);
      }
    }
  }
  if (/[ÃÂ]|â€/.test(JSON.stringify({ manifest: manifestToValidate, chunks: chunksToValidate }))) {
    throw new Error('El corpus contiene texto con codificación dañada.');
  }
}

async function main() {
  if (command === '--build') {
    const inputPath = process.argv[3];
    if (!inputPath) throw new Error('Uso: --build <paquete-curado.json>');
    ({ manifest, chunks } = JSON.parse(await readFile(resolve(inputPath), 'utf8')));
    validate(manifest, chunks);
    await writeCorpus(manifest, chunks);
  } else if (command === '--import-futsal-rules') {
    const inputPath = process.argv[3];
    if (!inputPath) throw new Error('Uso: --import-futsal-rules <circular-27.pdf>');
    [manifest, chunks] = await Promise.all([
      readFile(manifestPath, 'utf8').then(JSON.parse).then(repairMojibake),
      readFile(chunksPath, 'utf8').then(JSON.parse).then(repairMojibake),
    ]);
    const rulesChunks = await extractCompleteFutsalRules(resolve(inputPath));
    chunks = [
      ...chunks.filter((chunk) => chunk.documentId !== COMPLETE_RULES_DOCUMENT.id),
      ...rulesChunks,
    ];
    manifest = {
      ...manifest,
      version: '2026.09.02.2',
      generatedAt: new Date().toISOString(),
      chunkCount: chunks.length,
      documents: [
        ...manifest.documents.filter((document) => document.id !== COMPLETE_RULES_DOCUMENT.id),
        COMPLETE_RULES_DOCUMENT,
      ].sort((left, right) => right.date.localeCompare(left.date)),
    };
    validate(manifest, chunks);
    await writeCorpus(manifest, chunks);
  } else if (command === '--check') {
    [manifest, chunks] = await Promise.all([
      readFile(manifestPath, 'utf8').then(JSON.parse),
      readFile(chunksPath, 'utf8').then(JSON.parse),
    ]);
    validate(manifest, chunks);
  } else {
    console.error(
      'Uso: --check | --build <paquete-curado.json> | --import-futsal-rules <circular-27.pdf>',
    );
    process.exitCode = 1;
  }

  if (manifest && chunks) {
    console.log(`Corpus ${manifest.version} válido: ${chunks.length} fragmentos oficiales.`);
  }
}

await main();
