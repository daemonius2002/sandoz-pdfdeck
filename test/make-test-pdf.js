// Builds a PDF that mimics what InDesign exports for "Interactive PDF":
// push-button widgets with actions in /AA /U, /Next chains, Show/Hide via
// JavaScript and /Hide, named destinations, links and page transitions.
import { PDFDocument, PDFName, PDFString, StandardFonts, rgb } from 'pdf-lib';
import fs from 'node:fs';

const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.HelveticaBold);
const ctx = doc.context;
const W = 1024, H = 768;
const colors = [rgb(0.05, 0.2, 0.45), rgb(0.1, 0.4, 0.3), rgb(0.45, 0.15, 0.2), rgb(0.3, 0.3, 0.3)];
const pages = colors.map((c, i) => {
  const p = doc.addPage([W, H]);
  p.drawRectangle({ x: 0, y: 0, width: W, height: H, color: c });
  p.drawText(`Pagina ${i + 1}`, { x: 60, y: H - 120, size: 64, font, color: rgb(1, 1, 1) });
  return p;
});
pages[1].node.set(PDFName.of('Trans'), ctx.obj({ S: 'Dissolve', D: 0.4 }));

const ap = (w, h, r, g, b, label) => {
  const content = `${r} ${g} ${b} rg 0 0 ${w} ${h} re f BT /F1 22 Tf 1 1 1 rg 14 ${h / 2 - 8} Td (${label}) Tj ET`;
  const stream = ctx.stream(content, {
    Type: 'XObject', Subtype: 'Form', BBox: [0, 0, w, h],
    Resources: { Font: { F1: font.ref } },
  });
  return ctx.register(stream);
};
const fields = [];
const button = (page, name, [x, y, w, h], color, label, { A, AA, F } = {}) => {
  const dict = ctx.obj({
    Type: 'Annot', Subtype: 'Widget', FT: 'Btn', Ff: 65536, T: PDFString.of(name),
    Rect: [x, y, x + w, y + h], P: page.ref, F: F ?? 4,
    AP: { N: ap(w, h, ...color, label) },
  });
  if (A) dict.set(PDFName.of('A'), A);
  if (AA) dict.set(PDFName.of('AA'), AA);
  const ref = ctx.register(dict);
  page.node.addAnnot(ref);
  fields.push(ref);
  return ref;
};
const link = (page, [x, y, w, h], A) => {
  const ref = ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Link', Rect: [x, y, x + w, y + h], Border: [0, 0, 0], A }));
  page.node.addAnnot(ref);
};
const js = (code) => ctx.obj({ S: 'JavaScript', JS: PDFString.of(code) });

// Page 1
button(pages[0], 'Inainte', [820, 40, 170, 70], [0.9, 0.5, 0.1], 'Inainte >', { AA: ctx.obj({ U: { S: 'Named', N: 'NextPage' } }) });
button(pages[0], 'ArataPopup', [60, 300, 260, 70], [0.2, 0.6, 0.9], 'Arata detalii', {
  AA: ctx.obj({ U: js('this.getField("Popup").display = display.visible;') }),
});
button(pages[0], 'Popup', [380, 200, 500, 300], [0.85, 0.1, 0.3], 'POPUP - apasa sa inchizi', {
  F: 6, AA: ctx.obj({ U: { S: 'Hide', T: PDFString.of('Popup'), H: true } }),
});
link(pages[0], [60, 150, 260, 60], ctx.obj({ S: 'GoTo', D: PDFString.of('capitol3') }));
pages[0].drawText('Link -> pagina 3', { x: 70, y: 170, size: 24, font, color: rgb(1, 1, 0) });

// Page 2
button(pages[1], 'Inapoi', [40, 40, 170, 70], [0.9, 0.5, 0.1], '< Inapoi', { AA: ctx.obj({ U: { S: 'Named', N: 'PrevPage' } }) });
button(pages[1], 'Site', [400, 300, 260, 70], [0.3, 0.3, 0.8], 'Deschide site', { A: ctx.obj({ S: 'URI', URI: PDFString.of('https://example.com') }) });
button(pages[1], 'Acasa', [820, 40, 170, 70], [0.9, 0.5, 0.1], 'Acasa', { AA: ctx.obj({ U: { S: 'GoTo', D: [pages[0].ref, PDFName.of('Fit')] } }) });

// Page 3: chained actions (show pop-up, then nothing else) and JS navigation
const p3popup = button(pages[2], 'Grup.Info', [300, 250, 420, 250], [0.1, 0.5, 0.2], 'Info (grup)', { F: 6 });
button(pages[2], 'Afiseaza', [60, 300, 200, 70], [0.2, 0.6, 0.9], 'Afiseaza', {
  AA: ctx.obj({ U: { S: 'Hide', T: PDFString.of('Grup'), H: false, Next: js('var f = this.getField("Inchide"); f.display = display.visible;') } }),
});
button(pages[2], 'Inchide', [740, 420, 160, 60], [0.5, 0.5, 0.5], 'Inchide', {
  F: 6, AA: ctx.obj({ U: { S: 'Hide', T: [p3popup, PDFString.of('Inchide')], H: true } }),
});
button(pages[2], 'Ultima', [820, 40, 170, 70], [0.9, 0.5, 0.1], 'Ultima >>', { AA: ctx.obj({ U: js('this.pageNum = 3;') }) });

// Page 4
button(pages[3], 'Start', [820, 40, 170, 70], [0.9, 0.5, 0.1], 'De la inceput', { AA: ctx.obj({ U: { S: 'Named', N: 'FirstPage' } }) });

doc.catalog.set(PDFName.of('AcroForm'), ctx.obj({ Fields: fields }));
doc.catalog.set(PDFName.of('Names'), ctx.obj({ Dests: { Names: [PDFString.of('capitol3'), [pages[2].ref, PDFName.of('Fit')]] } }));
fs.writeFileSync(process.argv[2] || 'test/indesign-like.pdf', await doc.save({ useObjectStreams: false }));
console.log('ok');
