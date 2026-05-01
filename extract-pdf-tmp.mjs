import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import fs from "fs";

const data = new Uint8Array(fs.readFileSync(process.argv[2]));
const doc = await pdfjs.getDocument({ data, disableWorker: true }).promise;
let full = "";
for (let i = 1; i <= doc.numPages; i++) {
  const page = await doc.getPage(i);
  const tc = await page.getTextContent();
  const text = tc.items.map((it) => ("str" in it ? it.str : "")).join(" ");
  full += text + "\n---PAGINA---\n";
}
console.log(full);
