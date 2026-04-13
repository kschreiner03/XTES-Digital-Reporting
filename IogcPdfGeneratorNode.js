'use strict';

const path = require('path');
const fs = require('fs');
const { PDFDocument } = require('pdf-lib');

function requireJspdf() {
  return require('jspdf');
}

const { jsPDF } = requireJspdf();

// ─── Layout constants ─────────────────────────────────────────────────────────
const BORDER = 12.7;
const PAD    = 4;
const CM     = BORDER + PAD;  // content left/right margin

const TEAL       = [0, 125, 140];  // #007D8C
const BLACK      = [0, 0, 0];
const WHITE      = [255, 255, 255];
const LIGHT_LINE = [210, 210, 210];
const NUM_BG     = [230, 244, 246]; // #a5dce4 very light teal
const COMMENT_BG = [240, 249, 250]; // faint teal tint for comments
const GRAY_HDR   = [230, 244, 246]; // #E6F4F6 very light teal (replaces grey)

const LW_BOX   = 0.4;
const LW_GRID  = 0.3;
const LW_INNER = 0.2;
const LW_LIGHT = 0.12;
const BOX_PAD  = 3;
const NUM_W    = 12;
const ROW_HDR  = 5.5;
const CHK      = 2.5;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getPageDims(doc) {
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();
    return { pw, ph, cw: pw - CM * 2, maxY: ph - CM - 8 };
}

function loadImage(assetsDir, fileName) {
    try {
        const p = path.join(assetsDir, fileName);
        if (!fs.existsSync(p)) return null;
        const buf = fs.readFileSync(p);
        const ext = path.extname(fileName).toLowerCase();
        const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
        return `data:${mime};base64,${buf.toString('base64')}`;
    } catch { return null; }
}

function drawFooter(doc, data) {
    const { pw, ph } = getPageDims(doc);
    const fy = ph - BORDER - 4;
    doc.setDrawColor(...TEAL); doc.setLineWidth(0.5);
    doc.line(BORDER, fy, pw - BORDER, fy);
    doc.setFontSize(6); doc.setFont('times', 'normal'); doc.setTextColor(100, 100, 100);
    const loc  = data.cover?.legalLocation || data.location || '';
    const info = `Surface Lease Audit: ${loc}   Project #: ${data.projectNumber}   Client: ${data.cover?.lesseeName || ''}   Date: ${data.reportDate || ''}`;
    doc.text(info, pw / 2, fy + 3, { align: 'center' });
    doc.setTextColor(...BLACK);
}

function drawPageHeader(doc, logoBase64) {
    if (logoBase64) {
        doc.addImage(logoBase64, 'JPEG', BORDER, BORDER, 30, 8);
    }
}

function drawSectionBar(doc, title, y, _cw) {
    y += 4;
    doc.setFontSize(10.5); doc.setFont('times', 'bold'); doc.setTextColor(...TEAL);
    doc.text(title, CM, y);
    doc.setTextColor(...BLACK);
    return y + 7;
}

function drawSubHeader(doc, title, y, _cw) {
    y += 3;
    doc.setFontSize(9.5); doc.setFont('times', 'bold'); doc.setTextColor(...TEAL);
    doc.text(title, CM, y);
    doc.setTextColor(...BLACK);
    return y + 5;
}

function drawGrayRow(doc, text, x, y, w) {
    doc.setFillColor(...GRAY_HDR); doc.setDrawColor(...TEAL); doc.setLineWidth(LW_INNER);
    doc.rect(x, y, w, ROW_HDR, 'FD');
    doc.setFontSize(8.5); doc.setFont('times', 'bold'); doc.setTextColor(...BLACK);
    doc.text(text, x + BOX_PAD, y + ROW_HDR - 1.5);
    return y + ROW_HDR;
}

function drawCoverBox(doc, title, x, y, w, contentH) {
    drawGrayRow(doc, title, x, y, w);
    doc.setDrawColor(...TEAL); doc.setLineWidth(LW_BOX);
    doc.rect(x, y, w, ROW_HDR + contentH, 'S');
    return { iy: y + ROW_HDR + BOX_PAD, ey: y + ROW_HDR + contentH };
}

function drawRadio(doc, value, options, x, y) {
    doc.setFontSize(8); doc.setFont('times', 'normal'); doc.setTextColor(...BLACK);
    let cx = x;
    for (const opt of options) {
        const checked = opt === value;
        if (checked) {
            doc.setFillColor(...TEAL); doc.setDrawColor(...TEAL); doc.setLineWidth(0.25);
            doc.rect(cx, y - CHK + 0.3, CHK, CHK, 'FD');
            doc.setDrawColor(...WHITE); doc.setLineWidth(0.45);
            const bx = cx, by = y - CHK + 0.3;
            doc.line(bx + 0.4, by + 1.7, bx + 1.0, by + 2.2);
            doc.line(bx + 1.0, by + 2.2, bx + 2.1, by + 0.4);
        } else {
            doc.setDrawColor(...BLACK); doc.setLineWidth(0.2);
            doc.rect(cx, y - CHK + 0.3, CHK, CHK, 'S');
        }
        doc.setTextColor(...BLACK);
        doc.text(opt, cx + CHK + 1.5, y);
        cx += doc.getTextWidth(opt) + CHK + 5.5;
    }
    return 4;
}

function drawCheckbox(doc, selected, options, x, y) {
    doc.setFontSize(8); doc.setFont('times', 'normal'); doc.setTextColor(...BLACK);
    let cx = x;
    for (const opt of options) {
        const chkd = selected.includes(opt);
        if (chkd) {
            doc.setFillColor(...TEAL); doc.setDrawColor(...TEAL); doc.setLineWidth(0.25);
            doc.rect(cx, y - CHK + 0.3, CHK, CHK, 'FD');
            doc.setDrawColor(...WHITE); doc.setLineWidth(0.45);
            const bx = cx, by = y - CHK + 0.3;
            doc.line(bx + 0.4, by + 1.7, bx + 1.0, by + 2.2);
            doc.line(bx + 1.0, by + 2.2, bx + 2.1, by + 0.4);
        } else {
            doc.setDrawColor(...BLACK); doc.setLineWidth(0.2);
            doc.rect(cx, y - CHK + 0.3, CHK, CHK, 'S');
        }
        doc.setTextColor(...BLACK);
        doc.text(opt, cx + CHK + 1.5, y);
        cx += doc.getTextWidth(opt) + CHK + 8;
    }
    return 4;
}

function drawLabelRadioRight(doc, label, value, options, x, y, fullW) {
    doc.setFontSize(8); doc.setFont('times', 'normal'); doc.setTextColor(...BLACK);
    doc.text(label, x, y);
    const totalOptW = options.reduce((a, o) => a + doc.getTextWidth(o) + CHK + 7, 0);
    let cx = x + fullW - totalOptW;
    for (const opt of options) {
        const checked = opt === value || (opt === 'Included' && (value === 'Yes' || value === 'Included')) ||
                        (opt === 'Not Included' && (value === 'No' || value === 'Not Included'));
        if (checked) {
            doc.setFillColor(...TEAL); doc.setDrawColor(...TEAL); doc.setLineWidth(0.25);
            doc.rect(cx, y - CHK + 0.3, CHK, CHK, 'FD');
            doc.setDrawColor(...WHITE); doc.setLineWidth(0.45);
            const bx = cx, by = y - CHK + 0.3;
            doc.line(bx + 0.4, by + 1.7, bx + 1.0, by + 2.2);
            doc.line(bx + 1.0, by + 2.2, bx + 2.1, by + 0.4);
        } else {
            doc.setDrawColor(...BLACK); doc.setLineWidth(0.2);
            doc.rect(cx, y - CHK + 0.3, CHK, CHK, 'S');
        }
        doc.setTextColor(...BLACK);
        doc.text(opt, cx + CHK + 1.5, y);
        cx += doc.getTextWidth(opt) + CHK + 7;
    }
    return 4;
}

function drawLV(doc, label, value, x, y, maxW, fontSize) {
    fontSize = fontSize || 9;
    doc.setFontSize(fontSize);
    const lbl = `${label}: `;
    doc.setFont('times', 'bold'); doc.text(lbl, x, y);
    const lw = doc.getTextWidth(lbl);
    doc.setFont('times', 'normal');
    const lines = doc.splitTextToSize(value || '', Math.max(maxW - lw - 1, 30));
    doc.text(lines, x + lw, y);
    return doc.getTextDimensions(lines).h + 0.5;
}

// ─── Question drawing ─────────────────────────────────────────────────────────

function measureQ(doc, qText, fields, cw, showEmpty) {
    const innerW = cw - NUM_W - BOX_PAD * 2;
    doc.setFontSize(9);
    const primary = fields.find(f => f.primary);
    const qLine = primary ? `${qText}  ${primary.value || ''}` : qText;
    doc.setFont('times', 'bold');
    const qLines = doc.splitTextToSize(qLine, innerW);
    let h = doc.getTextDimensions(qLines).h + 1.5;
    doc.setFontSize(8);
    for (const f of fields) {
        if (f.primary) continue;
        if (f.type === 'radio' || f.type === 'checkbox' || f.type === 'rating') {
            h += 6.5; // 5mm row + 1.5mm spacing gap
        } else {
            if (!showEmpty && (!f.value || !f.value.trim())) continue;
            const isComment = f.label.toLowerCase().startsWith('comment');
            doc.setFont('times', 'bold');
            const lbl = `${f.label}: `;
            const lw = doc.getTextWidth(lbl);
            doc.setFont('times', 'normal');
            if (f.value && f.value.trim()) {
                const availW = isComment ? innerW - 2 : innerW - lw;
                const vLines = doc.splitTextToSize(f.value, Math.max(availW, 20));
                h += doc.getTextDimensions(vLines).h + (isComment ? 3.5 : 2.5); // +1.5 for gap
            } else {
                h += 6; // 4.5mm + 1.5mm spacing gap
            }
        }
    }
    return h + BOX_PAD * 2 + 4;
}

function drawQ(doc, num, qText, fields, boxTop, cw, showEmpty) {
    const numX     = CM + BOX_PAD;
    const contentX = CM + NUM_W + BOX_PAD;
    const contentW = cw - NUM_W - BOX_PAD * 2;
    let y = boxTop + BOX_PAD + 2;
    const primary = fields.find(f => f.primary);
    doc.setFontSize(9); doc.setFont('times', 'bold'); doc.setTextColor(...BLACK);
    doc.text(`${num}.`, numX, y);
    if (primary && primary.value) {
        const qLabel = `${qText}  `;
        doc.setFontSize(9); doc.setFont('times', 'bold');
        doc.text(qLabel, contentX, y);
        const qlW = doc.getTextWidth(qLabel);
        doc.setFont('times', 'normal'); doc.setTextColor(60, 60, 60);
        const valLines = doc.splitTextToSize(primary.value, Math.max(contentW - qlW - 1, 20));
        doc.text(valLines, contentX + qlW, y);
        doc.setTextColor(...BLACK);
        y += doc.getTextDimensions(valLines).h + 1.5;
    } else {
        doc.setFontSize(9); doc.setFont('times', 'bold');
        const qLines = doc.splitTextToSize(qText, contentW);
        doc.text(qLines, contentX, y);
        y += doc.getTextDimensions(qLines).h + 1.5;
    }
    const hasVisibleSubfields = fields.some(f =>
        !f.primary && (showEmpty || f.value?.trim() || f.type === 'radio' || f.type === 'checkbox' || f.type === 'rating')
    );
    if (hasVisibleSubfields) {
        // Thin separator between question text and its sub-fields
        doc.setDrawColor(...LIGHT_LINE); doc.setLineWidth(0.12);
        doc.line(CM + NUM_W, y + 0.5, CM + cw, y + 0.5);
        y += 1;
    }
    doc.setFontSize(8);
    for (const f of fields) {
        if (f.primary) continue;
        const isComment = f.label.toLowerCase().startsWith('comment');
        if ((f.type === 'radio' || f.type === 'rating') && f.options) {
            // Thin divider before each sub-field
            doc.setDrawColor(...LIGHT_LINE); doc.setLineWidth(0.12);
            doc.line(CM + NUM_W, y + 0.5, CM + cw, y + 0.5);
            y += 1.5;
            doc.setFont('times', 'bold'); doc.setTextColor(...BLACK);
            const lbl = `${f.label}: `;
            doc.text(lbl, contentX, y + 3.5);
            drawRadio(doc, f.value, f.options, contentX + doc.getTextWidth(lbl), y + 3.5);
            y += 5;
        } else if (f.type === 'checkbox' && f.options) {
            doc.setDrawColor(...LIGHT_LINE); doc.setLineWidth(0.12);
            doc.line(CM + NUM_W, y + 0.5, CM + cw, y + 0.5);
            y += 1.5;
            doc.setFont('times', 'bold'); doc.setTextColor(...BLACK);
            const lbl = `${f.label}: `;
            doc.text(lbl, contentX, y + 3.5);
            const sel = f.value ? f.value.split('||') : [];
            drawCheckbox(doc, sel, f.options, contentX + doc.getTextWidth(lbl), y + 3.5);
            y += 5;
        } else {
            if (!showEmpty && (!f.value || !f.value.trim())) continue;
            if (isComment && f.value?.trim()) {
                y += 1.5;
                const comLines = doc.splitTextToSize(f.value, contentW - 4);
                const comH = doc.getTextDimensions(comLines).h + 4;
                doc.setFillColor(...COMMENT_BG);
                doc.rect(CM + NUM_W, y, cw - NUM_W, comH, 'F');
                doc.setFont('times', 'italic'); doc.setTextColor(80, 80, 80); doc.setFontSize(7.5);
                doc.text('Comments:', contentX, y + 3);
                doc.setFont('times', 'normal'); doc.setTextColor(...BLACK); doc.setFontSize(8);
                doc.text(comLines, contentX + 20, y + 3);
                y += comH;
            } else {
                doc.setDrawColor(...LIGHT_LINE); doc.setLineWidth(0.12);
                doc.line(CM + NUM_W, y + 0.5, CM + cw, y + 0.5);
                y += 1.5;
                doc.setFont('times', 'bold'); doc.setTextColor(...BLACK);
                const lbl = `${f.label}: `;
                const lw = doc.getTextWidth(lbl);
                doc.text(lbl, contentX, y + 3.5);
                if (f.value && f.value.trim()) {
                    doc.setFont('times', 'normal');
                    const vLines = doc.splitTextToSize(f.value, contentW - lw - 1);
                    doc.text(vLines, contentX + lw, y + 3.5);
                    y += doc.getTextDimensions(vLines).h + 2.5;
                } else {
                    y += 5;
                }
            }
        }
    }
    y += BOX_PAD;
    doc.setFillColor(...NUM_BG);
    doc.rect(CM, boxTop, NUM_W, y - boxTop, 'F');
    doc.setFontSize(9); doc.setFont('times', 'bold'); doc.setTextColor(...BLACK);
    doc.text(`${num}.`, numX, boxTop + BOX_PAD + 2);
    return y;
}

function drawQBox(doc, top, bottom, cw) {
    doc.setDrawColor(...TEAL); doc.setLineWidth(LW_GRID);
    doc.line(CM, top, CM, bottom);
    doc.line(CM + cw, top, CM + cw, bottom);
    doc.line(CM, bottom, CM + cw, bottom);
    doc.setDrawColor(...TEAL); doc.setLineWidth(LW_INNER);
    doc.line(CM + NUM_W, top, CM + NUM_W, bottom);
}

async function renderQs(doc, data, qs, startY, cw, maxY, newPageFn, footerFn, subHeaders, showEmpty) {
    let cy = startY;
    // Top border of section
    doc.setDrawColor(...TEAL); doc.setLineWidth(LW_GRID);
    doc.line(CM, cy, CM + cw, cy);
    for (let i = 0; i < qs.length; i++) {
        const q = qs[i];
        if (subHeaders) {
            const sh = subHeaders.find(s => s.beforeQ === q.num);
            if (sh) {
                if (cy + 14 > maxY) {
                    // Close left/right borders before page break
                    doc.setDrawColor(...TEAL); doc.setLineWidth(LW_GRID);
                    doc.line(CM, startY, CM, cy);
                    doc.line(CM + NUM_W, startY, CM + NUM_W, cy);
                    doc.line(CM + cw, startY, CM + cw, cy);
                    footerFn(doc, data); cy = await newPageFn();
                    startY = cy;
                    doc.setDrawColor(...TEAL); doc.setLineWidth(LW_GRID);
                    doc.line(CM, cy, CM + cw, cy);
                }
                cy = drawSubHeader(doc, sh.title, cy, cw);
                // Teal accent line after sub-header
                doc.setDrawColor(...TEAL); doc.setLineWidth(0.3);
                doc.line(CM, cy, CM + cw, cy);
                cy += 1;
            }
        }
        const estH = measureQ(doc, `${q.num}. ${q.text}`, q.fields, cw, showEmpty);
        if (cy + estH > maxY) {
            // Close borders before page break
            doc.setDrawColor(...TEAL); doc.setLineWidth(LW_GRID);
            doc.line(CM, startY, CM, cy);
            doc.line(CM + NUM_W, startY, CM + NUM_W, cy);
            doc.line(CM + cw, startY, CM + cw, cy);
            footerFn(doc, data); cy = await newPageFn();
            startY = cy;
            doc.setDrawColor(...TEAL); doc.setLineWidth(LW_GRID);
            doc.line(CM, cy, CM + cw, cy);
        }
        const boxTop = cy;
        cy = drawQ(doc, q.num, q.text, q.fields, boxTop, cw, showEmpty);
        cy += 3; // inter-question spacing (replaces horizontal divider line)
    }
    // Outer borders: left, number-column divider, right, bottom
    doc.setDrawColor(...TEAL); doc.setLineWidth(LW_GRID);
    doc.line(CM, startY, CM, cy);
    doc.line(CM + NUM_W, startY, CM + NUM_W, cy);
    doc.line(CM + cw, startY, CM + cw, cy);
    doc.line(CM, cy, CM + cw, cy);
    return cy;
}

// ─── Text-value question rendering (label: value inline, comments teal italic) ──

function txtFieldValue(f) {
    if (!f.value) return '';
    if (f.type === 'checkbox') return f.value.split('||').filter(Boolean).join(', ');
    return f.value;
}

function drawChkBox(doc, checked, cx, y) {
    if (checked) {
        doc.setFillColor(...TEAL); doc.setDrawColor(...TEAL); doc.setLineWidth(0.25);
        doc.rect(cx, y - CHK + 0.3, CHK, CHK, 'FD');
        doc.setDrawColor(...WHITE); doc.setLineWidth(0.45);
        const bx = cx, by = y - CHK + 0.3;
        doc.line(bx + 0.4, by + 1.7, bx + 1.0, by + 2.2);
        doc.line(bx + 1.0, by + 2.2, bx + 2.1, by + 0.4);
    } else {
        doc.setDrawColor(...BLACK); doc.setLineWidth(0.2);
        doc.rect(cx, y - CHK + 0.3, CHK, CHK, 'S');
    }
}

function measureTxtQ(doc, q, cw) {
    const innerW = cw - NUM_W - BOX_PAD * 2;
    doc.setFontSize(8);
    let h = 2; // top inner pad
    for (const f of q.fields) {
        const isComment = f.label.toLowerCase().startsWith('comment');
        if (isComment) {
            h += 4;
            if (f.value && f.value.trim()) {
                doc.setFont('times', 'italic');
                const comLines = doc.splitTextToSize(f.value, innerW - 2);
                h += doc.getTextDimensions(comLines).h + 1.5;
            }
        } else if (f.type === 'radio' || f.type === 'checkbox' || f.type === 'rating') {
            doc.setFont('times', 'bold');
            const lw = doc.getTextWidth(`${f.label}: `);
            doc.setFont('times', 'normal');
            const totalOptW = (f.options || []).reduce((a, opt) => a + doc.getTextWidth(opt) + CHK + 3, 0);
            h += (lw + totalOptW > innerW) ? 9 : 4.5;
        } else {
            doc.setFont('times', 'bold');
            const lw = doc.getTextWidth(`${f.label}: `);
            const val = f.value || '';
            if (val.trim()) {
                doc.setFont('times', 'normal');
                const vLines = doc.splitTextToSize(val, Math.max(innerW - lw, 20));
                h += doc.getTextDimensions(vLines).h + 1.5;
            } else {
                h += 4;
            }
        }
    }
    h += 1.5; // bottom pad
    return h;
}

function drawTxtQ(doc, q, topY, cw) {
    const numX     = CM + BOX_PAD;
    const contentX = CM + NUM_W + BOX_PAD;
    const contentW = cw - NUM_W - BOX_PAD * 2;
    let y = topY + 2;
    doc.setFontSize(8);

    for (let i = 0; i < q.fields.length; i++) {
        const f = q.fields[i];
        const isComment = f.label.toLowerCase().startsWith('comment');
        if (i > 0) {
            doc.setDrawColor(...LIGHT_LINE); doc.setLineWidth(0.12);
            doc.line(CM + NUM_W, y, CM + cw, y);
        }
        if (isComment) {
            doc.setFont('times', 'bold'); doc.setTextColor(...BLACK);
            doc.text('Comments:', contentX, y + 3.5);
            y += 4;
            if (f.value && f.value.trim()) {
                doc.setFont('times', 'italic'); doc.setTextColor(...TEAL);
                const comLines = doc.splitTextToSize(f.value, contentW - 2);
                doc.text(comLines, contentX, y + 3.5);
                doc.setTextColor(...BLACK);
                y += doc.getTextDimensions(comLines).h + 1.5;
            }
        } else if (f.type === 'radio' || f.type === 'checkbox' || f.type === 'rating') {
            const lbl = `${f.label}: `;
            doc.setFont('times', 'bold'); doc.setTextColor(...BLACK);
            const lw = doc.getTextWidth(lbl);
            doc.setFont('times', 'normal');
            const opts = f.options || [];
            const sel = f.type === 'checkbox' ? (f.value ? f.value.split('||') : []) : null;
            const totalOptW = opts.reduce((a, opt) => a + doc.getTextWidth(opt) + CHK + 3, 0);
            let cx;
            if (lw + totalOptW > contentW) {
                doc.setFont('times', 'bold'); doc.text(lbl, contentX, y + 3.5);
                y += 4;
                cx = contentX;
            } else {
                doc.setFont('times', 'bold'); doc.text(lbl, contentX, y + 3.5);
                cx = contentX + lw;
            }
            doc.setFont('times', 'normal');
            for (const opt of opts) {
                const checked = sel ? sel.includes(opt) : opt === f.value;
                drawChkBox(doc, checked, cx, y + 3.5);
                doc.setTextColor(...BLACK);
                doc.text(opt, cx + CHK + 1.0, y + 3.5);
                cx += doc.getTextWidth(opt) + CHK + 3;
            }
            y += 4.5;
        } else {
            const lbl = `${f.label}: `;
            doc.setFont('times', 'bold'); doc.setTextColor(...BLACK);
            doc.text(lbl, contentX, y + 3.5);
            const lw = doc.getTextWidth(lbl);
            const val = f.value || '';
            if (val.trim()) {
                doc.setFont('times', 'normal');
                const vLines = doc.splitTextToSize(val, Math.max(contentW - lw, 20));
                doc.text(vLines, contentX + lw, y + 3.5);
                y += doc.getTextDimensions(vLines).h + 1.5;
            } else {
                y += 4;
            }
        }
    }
    y += 1.5;

    // Number column: light teal fill + bold number
    doc.setFillColor(...NUM_BG);
    doc.rect(CM, topY, NUM_W, y - topY, 'F');
    doc.setFontSize(9); doc.setFont('times', 'bold'); doc.setTextColor(...BLACK);
    doc.text(`${q.num}.`, numX, topY + 5.5);

    // Outer teal border + column divider
    doc.setDrawColor(...TEAL); doc.setLineWidth(LW_GRID);
    doc.rect(CM, topY, cw, y - topY, 'S');
    doc.line(CM + NUM_W, topY, CM + NUM_W, y);

    return y;
}

async function renderTxtQs(doc, data, qs, startY, cw, maxY, newPageFn, footerFn, subHeaders) {
    let cy = startY;
    for (let i = 0; i < qs.length; i++) {
        const q = qs[i];
        // Sub-header check
        if (subHeaders) {
            const sh = subHeaders.find(s => s.beforeQ === q.num);
            if (sh) {
                if (cy + 14 > maxY) { footerFn(doc, data); cy = await newPageFn(); }
                cy = drawSubHeader(doc, sh.title, cy, cw);
            }
        }
        const estH = measureTxtQ(doc, q, cw);
        if (cy + estH > maxY) { footerFn(doc, data); cy = await newPageFn(); }
        cy = drawTxtQ(doc, q, cy, cw);
        cy += 0.8;
    }
    return cy;
}

// ─── Main Generator ───────────────────────────────────────────────────────────

async function generateIogcPdf(data, assetsDir) {
    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'letter' });
    const { pw, ph, cw, maxY } = getPageDims(doc);
    const c = data.cover || {};

    const logoBase64         = loadImage(assetsDir, 'xterra-logo.jpg')         || loadImage(assetsDir, 'xterra-logo.png');
    const thunderchildBase64 = loadImage(assetsDir, 'thunderchild-logo.jpg');

    const newPage = async () => {
        doc.addPage();
        drawPageHeader(doc, logoBase64);
        return CM + 8;
    };
    const contPage = newPage;

    const ensureSpace = async (needed, curY) => {
        if (curY + needed > maxY) { drawFooter(doc, data); return await newPage(); }
        return curY;
    };

// ══════════════════════════════════════════════════════════════
// PAGE 1 — TITLE PAGE
// ══════════════════════════════════════════════════════════════

// ── Bottom teal bar + footer geometry ──
// Bar drawn from ph-BORDER all the way to ph — visually at the page edge,
// and thick enough that the printer's ~5mm non-printable margin still shows solid teal.
const tealBarH = BORDER;            // full border height (~12.7mm)
const tealBarY = ph - tealBarH;    // top of teal bar = ph - BORDER

const footerGap = 2;
const footerBottom = tealBarY - footerGap;  // footer content sits above the bar

const footerH = 20;
const footerTopY = footerBottom - footerH;
const footerMidY = footerTopY + footerH / 2;

// ── Bison photo — draw BEFORE text so it stays behind everything ──
const bisonBase64 = loadImage(assetsDir, 'bison1.jpg')
    || loadImage(assetsDir, 'landscape.JPG')
    || loadImage(assetsDir, 'landscape.jpg');

if (bisonBase64) {
    try {
        // slightly oversized so it feels scaled from the corner
        const imgW = pw + 8;
        const imgH = pw * 0.54;

        // small white gap above the footer block
        const gapAboveFooter = 2;

        const imgBottom = footerTopY - gapAboveFooter;
        const imgTop = imgBottom - imgH;

        // shift slightly left so enlargement stays visually centered
        doc.addImage(bisonBase64, 'JPEG', -4, imgTop, imgW, imgH);
    } catch {}
}

// ── Logo — top-left, same size as page headers ──
if (logoBase64) {
    doc.addImage(logoBase64, 'JPEG', BORDER, BORDER, 30, 8);
}

let y = BORDER + 14;

// ── Titles ──
doc.setFontSize(16);
doc.setFont('times', 'bold');
doc.setTextColor(...BLACK);
doc.text('Indian Oil and Gas Canada (IOGC)', pw / 2, y, { align: 'center' });
y += 9;

doc.text('Surface Lease Environmental Audit', pw / 2, y, { align: 'center' });
y += 12;

// ── Compliance callout ──
const q46Status = data.sectionE?.q46OverallCompliance || c.complianceStatus || '';
const inComp = q46Status.toLowerCase().startsWith('in compliance');
const compCallout = inComp ? 'Is in compliance' : 'Is not in compliance';

doc.setFontSize(12);
doc.setFont('times', 'bold');
doc.setTextColor(...TEAL);
doc.text(`LESSEE: ${compCallout}`, pw / 2, y, { align: 'center' });
y += 8;

doc.setTextColor(...BLACK);

// ── Summary paragraph ──
if (data.sectionE?.q46Comments) {
    doc.setFontSize(9);
    doc.setFont('times', 'normal');
    const sl = doc.splitTextToSize(data.sectionE.q46Comments, cw - 20);
    doc.text(sl, pw / 2, y, { align: 'center' });
    y += doc.getTextDimensions(sl).h + 6;
} else {
    y += 5;
}

// ── Teal rule ──
doc.setDrawColor(...TEAL);
doc.setLineWidth(0.4);
doc.line(pw / 2 - 40, y, pw / 2 + 40, y);
y += 8;

// ── Info fields — centred ──
const titleFields = [
    ['IOGC File #', c.iogcFileNumber],
    ['X-Terra File #', data.projectNumber],
    ['Reserve Name and Number', c.reserveNameNumber],
    ['Lessee Name', c.lesseeName],
    ['Surface Location', c.legalLocation || data.location],
    ['Spud Date', c.wellSpudDate],
    ['Audit Date', c.auditDate],
    ['Follow Up Date', data.followUpDate],
    ['Report Date', data.reportDate],
    ['Report Written By', data.reportWrittenBy],
    ['File Review and Report Professional Sign Off', data.professionalSignOff],
];

doc.setFontSize(9);
for (const [lbl, val] of titleFields) {
    if (!val) continue;

    doc.setFont('times', 'bold');
    const lblW = doc.getTextWidth(`${lbl}: `);
    doc.setFont('times', 'normal');
    const valW = doc.getTextWidth(String(val));
    const startX = (pw - lblW - valW) / 2;

    doc.setFont('times', 'bold');
    doc.text(`${lbl}: `, startX, y);

    doc.setFont('times', 'normal');
    doc.text(String(val), startX + lblW, y);

    y += 5.5;
}

// ── Footer: Thunderchild logo ──
if (thunderchildBase64) {
    const thunderchildLogoH = 18;
    const thunderchildLogoW = thunderchildLogoH * 1.91;

    doc.addImage(
        thunderchildBase64,
        'JPEG',
        (pw - thunderchildLogoW) / 2,
        footerMidY - thunderchildLogoH / 2 - 2,
        thunderchildLogoW,
        thunderchildLogoH
    );
}

// ── Footer: company info aligned consistently to left and right ──
const lineH = 3;
const textBlockH = lineH * 3;
const textY = footerMidY - (textBlockH / 2) + 1.5;

doc.setFontSize(7);
doc.setFont('times', 'normal');
doc.setTextColor(80, 80, 80);

// left block
doc.text('100 – 303 Wheeler Place', CM, textY, { align: 'left' });
doc.text('Saskatoon, SK  S7P 0A4', CM, textY + lineH, { align: 'left' });
doc.text('Tel (306) 373-1110', CM, textY + lineH * 2, { align: 'left' });

// right block — left-aligned from fixed x (same visual region, text reads left-to-right)
const rightX = pw - CM - 40;
doc.text('6208-48 Street', rightX, textY);
doc.text('Lloydminster, AB  T9V 2G1', rightX, textY + lineH);
doc.text('Tel (780) 875-1442', rightX, textY + lineH * 2);

doc.setTextColor(...BLACK);

// ── Thick teal bar — absolute bottom ──
doc.setFillColor(...TEAL);
doc.rect(0, tealBarY, pw, tealBarH, 'F');
    // ══════════════════════════════════════════════════════════════
    // PAGE 2 — TABLE OF CONTENTS
    // ══════════════════════════════════════════════════════════════
    y = await newPage(); y += 2;
    doc.setFontSize(11); doc.setFont('times', 'bold'); doc.setTextColor(...TEAL);
    const auditYear = c.auditDate ? new Date(c.auditDate).getFullYear() : new Date().getFullYear();
    doc.text(`${auditYear} AUDIT PACKAGE — TABLE OF CONTENTS`, CM, y);
    doc.setTextColor(...BLACK); y += 3;
    doc.setDrawColor(...TEAL); doc.setLineWidth(0.5);
    doc.line(CM, y, CM + cw, y); y += 7;

    const sANote = c.auditType === '1st Year' ? '' : `  \u2013  Not applicable`;
    const drawTocRow = (num, title, indent, bold, size) => {
        const tx = CM + indent;
        doc.setFontSize(size); doc.setFont('times', bold ? 'bold' : 'normal'); doc.setTextColor(...BLACK);
        if (num) { doc.text(num, tx, y); doc.text(title, tx + 8, y); }
        else { doc.text(title, tx, y); }
        y += size * 0.45 + 1.5;
    };
    drawTocRow('1.', 'IOGC SURFACE LEASE ENVIRONMENTAL AUDIT COVER SHEET', 0, true, 10); y += 3;
    drawTocRow('2.', 'IOGC SURFACE LEASE ENVIRONMENTAL AUDIT', 0, true, 10); y += 1;
    const tocSections = [
        { letter: 'A', title: `FIRST YEAR (ONLY) ENVIRONMENTAL AUDIT REQUIREMENTS${sANote}` },
        { letter: 'B', title: 'VEGETATION MONITORING AND MANAGEMENT' },
        { letter: 'C', title: 'GENERAL HOUSE KEEPING', subs: ['General', 'Topography/Surface Drainage', 'Water Features/Waterbodies'] },
        { letter: 'D', title: 'ENVIRONMENTAL PROTECTION AND SAFETY', subs: ['Lease Access and Security', 'Chemical Storage and Containment', 'Spill Prevention, Response and Reporting', 'Emergency Response Plan (ERP) and Safety'] },
        { letter: 'E', title: 'OVERALL/SUMMARY ENVIRONMENTAL AUDIT' },
        { letter: 'F', title: 'ENVIRONMENTAL AUDIT ATTACHMENTS', subs: ['Copy of the IOGC Environmental Protection Terms Letter', 'Site Sketch and Survey', 'Site Photos', 'Follow Up Compliance Reporting \u2013 Photo Log'] },
    ];
    for (const sec of tocSections) {
        drawTocRow('', `${sec.letter} \u2013 ${sec.title}`, 12, false, 9);
        if (sec.subs) sec.subs.forEach(s => drawTocRow('', `- ${s}`, 24, false, 8.5));
        y += 1.5;
    }
    y += 3;
    drawTocRow('3.', 'LIMITATIONS AND QUALIFICATIONS', 0, true, 10);
    drawFooter(doc, data);

    // ══════════════════════════════════════════════════════════════
    // PAGE 3 — COVER SHEET
    // ══════════════════════════════════════════════════════════════
    y = await newPage();
    doc.setFontSize(10.5); doc.setFont('times', 'bold'); doc.setTextColor(...TEAL);
    doc.text('1.  INDIAN OIL AND GAS CANADA (IOGC) SURFACE LEASE ENVIRONMENTAL AUDIT COVER SHEET', CM, y, { maxWidth: cw });
    doc.setTextColor(...BLACK); y += 8;

    // ── Site Information ──
    {
        const ROW = 5.5; const NROWS = 5; const boxH = NROWS * ROW + 0.5;
        const bx = CM;
        const { ey } = drawCoverBox(doc, 'Site Information', bx, y, cw, boxH);
        const rowY = r => y + ROW_HDR + r * ROW + ROW * 0.72;
        const c3 = cw / 3;
        // helper: bold label + normal value inline
        const drawLVCell = (label, value, x, maxW, row) => {
            const ty = rowY(row);
            const lbl = `${label}: `;
            doc.setFontSize(8.5); doc.setFont('times', 'bold'); doc.setTextColor(...BLACK);
            doc.text(lbl, x + BOX_PAD, ty);
            const lw = doc.getTextWidth(lbl);
            doc.setFont('times', 'normal');
            doc.text(doc.splitTextToSize(value || '', maxW - BOX_PAD * 2 - lw - 1)[0] || '', x + BOX_PAD + lw, ty);
        };
        drawLVCell('IOGC File #', c.iogcFileNumber, bx, c3, 0);
        drawLVCell('Legal Location', c.legalLocation, bx + c3, c3, 0);
        drawLVCell('Province', c.province, bx + c3 * 2, c3, 0);
        doc.setDrawColor(...TEAL); doc.setLineWidth(LW_INNER);
        doc.line(bx + c3, y + ROW_HDR, bx + c3, y + ROW_HDR + ROW);
        doc.line(bx + c3 * 2, y + ROW_HDR, bx + c3 * 2, y + ROW_HDR + ROW);
        drawLVCell('Reserve Name and Number', c.reserveNameNumber, bx, cw, 1);
        drawLVCell('Lessee Name', c.lesseeName, bx, cw, 2);
        drawLVCell('Well Spud Date', c.wellSpudDate, bx, cw, 3);
        drawLVCell('X-Terra File #', data.projectNumber, bx, cw / 2, 4);
        // No horizontal row dividers — whitespace replaces them
        y = ey + 1;
    }

    // ── Site Status ──
    {
        const { iy, ey } = drawCoverBox(doc, 'Site Status', CM, y, cw, 7);
        drawRadio(doc, c.siteStatus, ['Active', 'Suspended', 'Abandoned', 'Active Reclamation', 'Not Built'], CM + BOX_PAD + 1, iy + 1);
        y = ey + 1;
    }

    // ── Type of Site + Commodity Flags ──
    {
        const { iy, ey } = drawCoverBox(doc, 'Type of Site / Commodity Flags', CM, y, cw, 20);
        let fy = iy;
        drawCheckbox(doc, c.siteTypes || [], ['Well Site', 'Access Road', 'Battery', 'Compressor', 'Produced Water Disposal'], CM + BOX_PAD + 1, fy); fy += 5;
        drawCheckbox(doc, c.siteTypes || [], ['Pipeline Riser', 'Other'], CM + BOX_PAD + 1, fy); fy += 5;
        doc.setFont('times', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...BLACK);
        doc.text('Commodity / Facility Flags:', CM + BOX_PAD + 1, fy); fy += 4;
        doc.setFont('times', 'normal');
        drawCheckbox(doc, c.gasFlags || [], ['Gas', 'Sour Gas', 'Oil', 'Sour Oil', 'Remote Sump', 'Tanks', 'UST'], CM + BOX_PAD + 1, fy);
        y = ey + 1;
    }

    // ── Date + Audit Type ──
    {
        const { iy, ey } = drawCoverBox(doc, 'Date of Environmental Audit Site Inspection', CM, y, cw, 10);
        let fy = iy;
        doc.setFont('times', 'normal'); doc.setFontSize(9);
        doc.text(c.auditDate || '', CM + BOX_PAD + 1, fy); fy += 4;
        doc.setFont('times', 'bold'); doc.setFontSize(8);
        doc.text('Audit Type:', CM + BOX_PAD + 1, fy);
        drawRadio(doc, c.auditType, ['1st Year', '2nd Year (Pipeline)', '3 Year', '5 Year', '10 Year (Pipeline)'], CM + BOX_PAD + 22, fy);
        y = ey + 1;
    }

    // ── Copy sent to FN ──
    {
        const { iy, ey } = drawCoverBox(doc, 'Copy of Environmental Audit sent to the First Nation', CM, y, cw, 6);
        drawRadio(doc, c.copySentToFirstNation, ['Yes', 'No'], CM + BOX_PAD + 1, iy + 1);
        y = ey + 1;
    }

    // ── Report Addresses ──
    {
        const rows = [
            ['All lease facilities including access road, associated borrow pits, and/or sumps', c.reportAddressesFacilities],
            ['Vegetation Monitoring and Management (B)', c.reportAddressesVegetation],
            ['General Housekeeping (C)', c.reportAddressesHousekeeping],
            ['Environmental Protection and Safety (D)', c.reportAddressesProtection],
            ['Overall/Summary Environmental Audit Requirements (E)', c.reportAddressesSummary],
            ['Review of compliance with IOGC Environmental Protection Terms Letter', c.reportAddressesTermsReview],
        ];
        const rH = 5.0; const cH = rows.length * rH + BOX_PAD;
        const { iy, ey } = drawCoverBox(doc, 'Report Addresses the Following', CM, y, cw, cH);
        let fy = iy;
        for (let i = 0; i < rows.length; i++) {
            drawLabelRadioRight(doc, rows[i][0], rows[i][1], ['Included', 'Not Included'], CM + BOX_PAD + 1, fy + 3, cw - BOX_PAD * 2 - 2);
            fy += rH;
            // No divider lines between rows — whitespace provides separation
        }
        y = ey + 1;
    }

    // ── Attachments ──
    {
        const rows = [
            ['Copy of IOGC Environmental Protection Terms Letter', c.attachTermsLetter],
            ['Site sketch and survey (includes all structures)', c.attachSiteSketch],
            ['Site Photos', c.attachSitePhotos],
            ['Follow Up Compliance Reporting \u2013 Photo Log', c.attachFollowUp],
        ];
        const rH = 5.0; const cH = rows.length * rH + BOX_PAD;
        const { iy, ey } = drawCoverBox(doc, 'Attachments', CM, y, cw, cH);
        let fy = iy;
        for (let i = 0; i < rows.length; i++) {
            drawLabelRadioRight(doc, rows[i][0], rows[i][1], ['Included', 'Not Included'], CM + BOX_PAD + 1, fy + 3, cw - BOX_PAD * 2 - 2);
            fy += rH;
            // No divider lines between rows
        }
        y = ey + 1;
    }

    // ── Compliance ──
    {
        const coverComp = data.sectionE?.q46OverallCompliance || c.complianceStatus || '';
        const { iy, ey } = drawCoverBox(doc, 'Compliance', CM, y, cw, 16);
        let fy = iy;
        const normComp = coverComp.toLowerCase().startsWith('in compliance') ? 'In compliance' : 'Not in compliance \u2013 explain below';
        // Pre-compute aligned checkbox start x (matches drawLabelRadioRight at 8pt gap-7)
        doc.setFontSize(8); doc.setFont('times', 'normal');
        const sumOptW = ['Included', 'N/A'].reduce((a, o) => a + doc.getTextWidth(o) + CHK + 7, 0);
        const sumChkX = CM + cw - BOX_PAD - 1 - sumOptW;
        // Row 1: compliance radios (left) + summary label + aligned checkboxes (right)
        drawRadio(doc, normComp, ['In compliance', 'Not in compliance \u2013 explain below'], CM + BOX_PAD + 1, fy);
        {
            let ox = sumChkX;
            for (const opt of ['Included', 'N/A']) {
                drawChkBox(doc, c.nonComplianceSummaryIncluded === opt, ox, fy);
                doc.setFontSize(8); doc.setFont('times', 'normal'); doc.setTextColor(...BLACK);
                doc.text(opt, ox + CHK + 1.5, fy);
                ox += doc.getTextWidth(opt) + CHK + 7;
            }
            doc.setFontSize(7.5); doc.setFont('times', 'normal'); doc.setTextColor(...BLACK);
            doc.text('\u2013 Summary of non-compliance issues included or N/A', sumChkX - 2, fy, { align: 'right' });
        }
        fy += 5;
        drawLabelRadioRight(doc, 'Recommendation(s) on how to bring site into compliance', c.recommendationsIncluded, ['Included', 'N/A'], CM + BOX_PAD + 1, fy + 1, cw - BOX_PAD * 2 - 2); fy += 5;
        drawLabelRadioRight(doc, 'Description and documentation of how site has been brought into compliance', c.complianceDescriptionIncluded, ['Included', 'N/A'], CM + BOX_PAD + 1, fy + 1, cw - BOX_PAD * 2 - 2);
        y = ey + 1;
    }

    // ── Professional Declaration — stays on same page as cover sheet ──
    {
        const { iy, ey } = drawCoverBox(doc, 'Professional Declaration', CM, y, cw, 18);
        let fy = iy;
        doc.setFontSize(7.5); doc.setFont('times', 'italic'); doc.setTextColor(60, 60, 60);
        doc.text(doc.splitTextToSize('I declare that the information in this environmental audit report is accurate and complete to the best of my knowledge.', cw - BOX_PAD * 2 - 2), CM + BOX_PAD + 1, fy + 3);
        doc.setTextColor(...BLACK); fy += 8;
        const sx = CM + BOX_PAD + 1; const sw = (cw - BOX_PAD * 2 - 4) / 3; const gap = 4;
        const cols = [{ label: 'Signature', value: '' }, { label: 'Name and Professional Designation', value: c.declarationName || '' }, { label: 'Date', value: c.declarationDate || '' }];
        for (let i = 0; i < cols.length; i++) {
            const colX = sx + i * (sw + gap / 2);
            doc.setFontSize(8); doc.setFont('times', 'normal'); doc.setTextColor(...BLACK);
            if (cols[i].value) doc.text(cols[i].value, colX, fy);
            doc.setDrawColor(80, 80, 80); doc.setLineWidth(0.3);
            doc.line(colX, fy + 2.5, colX + sw - gap / 2, fy + 2.5);
            doc.setFontSize(6.5); doc.setFont('times', 'italic'); doc.setTextColor(100, 100, 100);
            doc.text(cols[i].label, colX + (sw - gap / 2) / 2, fy + 5.5, { align: 'center' });
        }
        doc.setTextColor(...BLACK);
        y = ey;
    }
    drawFooter(doc, data);

    // ── Section page header ────────────────────────────────────────
    // showSiteInfo=true only on the very first section page (A or B)
    const startSectionPage = async (showSiteInfo = false) => {
        // Only start a new page when showing the site info header, or when < 50mm remains
        if (!showSiteInfo && y + 50 <= maxY) {
            return y + 8; // continue on same page with a section gap
        }
        drawFooter(doc, data);
        let sy = await newPage();
        if (!showSiteInfo) return sy;
        doc.setFontSize(10.5); doc.setFont('times', 'bold'); doc.setTextColor(...TEAL);
        doc.text('2.  INDIAN OIL AND GAS CANADA (IOGC) SURFACE LEASE ENVIRONMENTAL AUDIT', CM, sy, { maxWidth: cw });
        doc.setTextColor(...BLACK); sy += 7;
        // Site info box — sized to cover only the data rows (notes rendered outside/below)
        const siBoxH = 11; // tight fit: header(5.5) + gap(3.5) + row1(4.5) + row2 + small pad
        const siBoxY0 = sy; // remember box top
        drawGrayRow(doc, 'Site Information', CM, sy, cw);
        doc.setDrawColor(...TEAL); doc.setLineWidth(LW_BOX);
        doc.rect(CM, sy, cw, ROW_HDR + siBoxH, 'S');
        sy += ROW_HDR + 3.5; // 3.5mm clears the header bottom border from the text
        const c3 = cw / 3;
        drawLV(doc, 'IOGC File #', c.iogcFileNumber, CM + BOX_PAD, sy, c3 - BOX_PAD, 8);
        drawLV(doc, 'Legal Location', c.legalLocation, CM + c3 + BOX_PAD, sy, c3 - BOX_PAD, 8);
        drawLV(doc, 'Province', c.province, CM + c3 * 2 + BOX_PAD, sy, c3 - BOX_PAD, 8); sy += 4.5;
        drawLV(doc, 'Reserve Name and Number', c.reserveNameNumber, CM + BOX_PAD, sy, cw - BOX_PAD * 2, 8);
        // Jump past box bottom — notes are outside the box, no border, more breathing room
        sy = siBoxY0 + ROW_HDR + siBoxH + 5;
        doc.setFontSize(7.5); doc.setFont('times', 'italic'); doc.setTextColor(...TEAL);
        if (c.auditType === '1st Year') {
            doc.text('*First year environmental audits should include Sections A\u2013F.', CM, sy);
        } else {
            doc.text('*Subsequent year environmental audits should include Sections B\u2013F.', CM, sy);
        }
        doc.setTextColor(...BLACK); sy += 5;
        return sy;
    };

    const A = data.sectionA || {};
    const B = data.sectionB || {};
    const C = data.sectionC || {};
    const D = data.sectionD || {};
    const E = data.sectionE || {};
    const isFirstYear = c.auditType === '1st Year';

    // ══════════════════════════════════════════════════════════════
    // SECTION A — FIRST YEAR REQUIREMENTS (only if first year audit)
    // ══════════════════════════════════════════════════════════════
    if (isFirstYear) {
        y = await startSectionPage(true); // first section page — show site info header
        y = drawSectionBar(doc, 'A \u2013 FIRST YEAR (ONLY) ENVIRONMENTAL AUDIT REQUIREMENTS', y, cw);
        const qsA = [
            { num: '1', text: 'Was an Environmental Monitor required during construction?', fields: [
                { label: 'Required', value: A.q1EnvMonitorRequired, type: 'radio', options: ['Yes', 'No', 'N/A'] },
                { label: 'Monitor Name', value: A.q1MonitorName },
                { label: 'Monitor Company', value: A.q1MonitorCompany },
                { label: 'Start of Construction Date', value: A.q1StartConstructionDate },
                { label: 'Construction Method', value: A.q1ConstructionMethod },
                { label: 'Soil Handling', value: A.q1SoilHandling },
                { label: 'Soil Handling Explanation', value: A.q1SoilHandlingExplain },
                { label: 'Spud Date', value: A.q1SpudDate },
                { label: 'Setbacks', value: A.q1Setbacks },
                { label: 'Comments', value: A.q1Comments },
            ]},
            { num: '2', text: 'Was a First Nation Liaison present during construction?', fields: [
                { label: 'FN Liaison Present', value: A.q2FnLiaison, type: 'radio', options: ['Yes', 'No', 'N/A'] },
                { label: 'Liaison Name', value: A.q2LiaisonName },
                { label: 'Cultural Sites Identified', value: A.q2CulturalSites, type: 'radio', options: ['Yes', 'No', 'N/A'] },
                { label: 'Comments', value: A.q2Comments },
            ]},
            { num: '3', text: 'Was a Wildlife/Vegetation Survey conducted prior to construction?', fields: [
                { label: 'Survey Conducted', value: A.q3WildlifeSurvey, type: 'radio', options: ['Yes', 'No', 'N/A'] },
                { label: 'Comments', value: A.q3Comments },
            ]},
            { num: '4', text: 'Was additional mitigation required?', fields: [
                { label: 'Additional Mitigation Required', value: A.q4AdditionalMitigation, type: 'radio', options: ['Yes', 'No', 'N/A'] },
                { label: 'Comments', value: A.q4Comments },
            ]},
            { num: '5', text: 'Were any fence alterations required?', fields: [
                { label: 'Fence Alterations', value: A.q5FenceAlterations, type: 'radio', options: ['Yes', 'No', 'N/A'] },
                { label: 'Comments', value: A.q5Comments },
            ]},
            { num: '6', text: 'Was water well testing conducted?', fields: [
                { label: 'Water Well Testing', value: A.q6WaterWellTesting, type: 'radio', options: ['Yes', 'No', 'N/A'] },
                { label: 'Results Included', value: A.q6ResultsIncluded, type: 'radio', options: ['Yes', 'No', 'N/A'] },
                { label: 'Comments', value: A.q6Comments },
            ]},
            { num: '7', text: 'Waste Location and Drilling Mud Disposal', fields: [
                { label: 'Waste Location on Reserve', value: A.q7ReserveLocation },
                { label: 'Compliance with Provincial Regulations', value: A.q7ComplianceWithRegs, type: 'radio', options: ['Yes', 'No', 'N/A'] },
                { label: 'Mud Type', value: A.q7MudType },
                { label: 'Sump Type', value: A.q7SumpType },
                { label: 'Disposal Methods', value: (A.q7DisposalMethods || []).join(', ') },
                { label: 'Comments', value: A.q7Comments },
            ]},
            { num: '8', text: 'Was landspray conducted on-reserve?', fields: [
                { label: 'Landspray on Reserve', value: A.q8LandsprayOnReserve, type: 'radio', options: ['Yes', 'No', 'N/A'] },
                { label: 'Report Attached', value: A.q8ReportAttached, type: 'radio', options: ['Yes', 'No', 'N/A'] },
                { label: 'Meets Criteria', value: A.q8MeetsCriteria, type: 'radio', options: ['Yes', 'No', 'N/A'] },
            ]},
            { num: '9', text: 'Timber / Merchantable Timber Methods', fields: [
                { label: 'Methods Used', value: (A.q9TimberMethods || []).join(', ') },
                { label: 'FN Notification', value: A.q9FnNotification, type: 'radio', options: ['Yes', 'No', 'N/A'] },
            ]},
            { num: '10', text: 'Progressive Reclamation', fields: [
                { label: 'Progressive Reclamation', value: A.q10ProgressiveReclamation, type: 'radio', options: ['Yes', 'No', 'N/A'] },
                { label: 'Slopes Contoured to Surrounding Area', value: A.q10SlopesContoured, type: 'radio', options: ['Yes', 'No', 'N/A'] },
                { label: 'Soils Re-spread over Non-Use Portion', value: A.q10SoilsRespread, type: 'radio', options: ['Yes', 'No', 'N/A'] },
                { label: 'Vegetation Method', value: A.q10VegetationMethod },
                { label: 'Certified Seed Analysis', value: A.q10CertifiedSeed, type: 'radio', options: ['Yes', 'No', 'N/A'] },
                { label: 'Vegetation Establishment', value: A.q10VegetationEstablishment, type: 'radio', options: ['Good', 'Fair', 'Poor', 'N/A'] },
                { label: 'Comments', value: A.q10Comments },
            ]},
            { num: '11', text: 'Was construction cleanup completed?', fields: [
                { label: 'Construction Cleanup', value: A.q11ConstructionCleanup, type: 'radio', options: ['Yes', 'No', 'N/A'] },
                { label: 'Comments', value: A.q11Comments },
            ]},
        ];
        y = await renderTxtQs(doc, data, qsA, y, cw, maxY, contPage, drawFooter, null);
    }

    // ══════════════════════════════════════════════════════════════
    // SECTION B — VEGETATION
    // ══════════════════════════════════════════════════════════════
    y = await startSectionPage(!isFirstYear); // first section page only if not a 1st year audit
    y = drawSectionBar(doc, 'B \u2013 VEGETATION MONITORING AND MANAGEMENT', y, cw);
    const qsB = [
        { num: '12', text: 'Weed / Invasive Species List', fields: [
            { label: 'Weed Species Present', value: B.q12WeedList },
            { label: 'Comments', value: B.q12Comments },
        ]},
        { num: '13', text: 'Vegetation Status and Condition', fields: [
            { label: 'Vegetation Status', value: B.q13VegetationStatus, type: 'radio', options: ['Good', 'Fair', 'Poor', 'N/A'] },
            { label: 'Stressed Vegetation On-Site or Off-Site', value: B.q13StressedVegetation, type: 'radio', options: ['Yes', 'No', 'N/A'] },
            { label: 'Bare Spots On-Site or Off-Site', value: B.q13BareSpots, type: 'radio', options: ['Yes', 'No', 'N/A'] },
            { label: 'Comments', value: B.q13Comments },
        ]},
        { num: '14', text: 'Weed Monitoring and Control Program', fields: [
            { label: 'Weed Monitoring Plan in Place', value: B.q14WeedMonitoringPlan, type: 'radio', options: ['Yes', 'No', 'N/A'] },
            { label: 'Weed Control Strategies', value: (B.q14WeedControlOptions || []).join(', ') },
            { label: 'Control Notes', value: B.q14WeedControlStrategies },
            { label: 'Ongoing Inspections for Weed Species', value: B.q14OngoingInspections, type: 'radio', options: ['Yes', 'No', 'N/A'] },
            { label: 'Compliant with Provincial Regulations', value: B.q14CompliantWithRegs, type: 'radio', options: ['Yes', 'No', 'N/A'] },
            { label: 'Comments', value: B.q14Comments },
        ]},
    ];
    y = await renderTxtQs(doc, data, qsB, y, cw, maxY, contPage, drawFooter, null);

    // ══════════════════════════════════════════════════════════════
    // SECTION C — GENERAL HOUSEKEEPING
    // ══════════════════════════════════════════════════════════════
    y = await startSectionPage(false);
    y = drawSectionBar(doc, 'C \u2013 GENERAL HOUSEKEEPING', y, cw);
    const qsC = [
        { num: '15', text: 'Activity Status of Lease', fields: [
            { label: 'Activity Status', value: C.q15Activity, type: 'radio', options: ['Active', 'Suspended', 'Abandoned', 'Active Reclamation', 'Not Built'] },
            { label: 'Comments', value: C.q15Comments },
        ]},
        { num: '16', text: 'Land Use and Access Road Condition', fields: [
            { label: 'Land Use', value: C.q16Landuse },
            { label: 'Access Road Conditions', value: C.q16AccessRoadConditions },
            { label: 'Comments', value: C.q16Comments },
        ]},
        { num: '17', text: 'Topography / Surface Drainage', fields: [
            { label: 'Low Spots / Slumping', value: C.q17LowSpotsSlumping, type: 'radio', options: ['Yes', 'No', 'N/A'] },
            { label: 'Rutting', value: C.q17Rutting, type: 'radio', options: ['Yes', 'No', 'N/A'] },
            { label: 'Lease Accessibility', value: C.q17LeaseAccessibility },
            { label: 'Comments', value: C.q17Comments },
        ]},
        { num: '18', text: 'Traffic and Site Access Controls', fields: [
            { label: 'Traffic', value: C.q18Traffic },
            { label: 'Comments', value: C.q18Comments },
        ]},
        { num: '19', text: 'Lease Berm Condition', fields: [
            { label: 'Berm Condition', value: C.q19LeaseBermCondition, type: 'radio', options: ['Good', 'Fair', 'Poor', 'N/A'] },
            { label: 'Comments', value: C.q19Comments },
        ]},
        { num: '20', text: 'Flare Stack / Incinerator', fields: [
            { label: 'Flare Stack Present', value: C.q20FlareStack, type: 'radio', options: ['Yes', 'No', 'N/A'] },
            { label: 'Comments', value: C.q20Comments },
        ]},
        { num: '21', text: 'Odour Detection', fields: [
            { label: 'Odour Detected', value: C.q21OdourDetection, type: 'radio', options: ['Yes', 'No', 'N/A'] },
            { label: 'Comments', value: C.q21Comments },
        ]},
        { num: '22', text: 'Unused Equipment and Felled Trees', fields: [
            { label: 'Unused Equipment Removed', value: C.q22UnusedEquipmentRemoved, type: 'radio', options: ['Yes', 'No', 'N/A'] },
            { label: 'Felled Trees / Log Decks Removed', value: C.q22FelledTreesRemoved, type: 'radio', options: ['Yes', 'No', 'N/A'] },
            { label: 'Comments', value: C.q22Comments },
        ]},
        { num: '23', text: 'Garbage / Debris', fields: [
            { label: 'Garbage / Debris Condition', value: C.q23GarbageDebris, type: 'radio', options: ['Good', 'Fair', 'Poor', 'N/A'] },
            { label: 'Comments', value: C.q23Comments },
        ]},
        { num: '24', text: 'Reported Complaints', fields: [
            { label: 'Reported Complaints', value: C.q24ReportedComplaints, type: 'radio', options: ['Yes', 'No', 'N/A'] },
            { label: 'Investigated', value: C.q24Investigated, type: 'radio', options: ['Yes', 'No', 'N/A'] },
            { label: 'Comments', value: C.q24Comments },
        ]},
        { num: '25', text: 'Drainage, Ponding and Waterbody Conditions', fields: [
            { label: 'Drainage Condition', value: C.q25Drainage, type: 'radio', options: ['Good', 'Fair', 'Poor', 'N/A'] },
            { label: 'Ponding Present', value: C.q25Ponding, type: 'radio', options: ['Yes', 'No', 'N/A'] },
            { label: 'Aquatic Vegetation', value: C.q25AquaticVegetation, type: 'radio', options: ['Yes', 'No', 'N/A'] },
            { label: 'Comments', value: C.q25Comments },
        ]},
        { num: '26', text: 'Pump-Off / Sump Conditions', fields: [
            { label: 'Pump-Off Required', value: C.q26PumpOff, type: 'radio', options: ['Yes', 'No', 'N/A'] },
            { label: 'Frequency', value: C.q26Frequency },
            { label: 'Erosion Present', value: C.q26Erosion, type: 'radio', options: ['Yes', 'No', 'N/A'] },
            { label: 'Comments', value: C.q26Comments },
        ]},
        { num: '27', text: 'Erosion Control Measures', fields: [
            { label: 'Erosion Control Effectiveness', value: C.q27ErosionControl, type: 'radio', options: ['Effective', 'Partially Effective', 'Not Effective', 'N/A'] },
            { label: 'Comments', value: C.q27Comments },
        ]},
        { num: '28', text: 'Waterbodies and Setbacks', fields: [
            { label: 'Waterbodies Present', value: C.q28Waterbodies, type: 'radio', options: ['Yes', 'No', 'N/A'] },
            { label: 'Distance to Waterbody', value: C.q28Distance },
            { label: 'Area', value: C.q28Area },
            { label: 'Buffer Maintained', value: C.q28Buffer, type: 'radio', options: ['Yes', 'No', 'N/A'] },
            { label: 'Mitigation Measures', value: C.q28Mitigation },
            { label: 'Comments', value: C.q28Comments },
        ]},
        { num: '29', text: 'Permits and Authorizations', fields: [
            { label: 'All Permits in Place', value: C.q29PermitsAuthorization, type: 'radio', options: ['Yes', 'No', 'N/A'] },
            { label: 'Ongoing Permit Requirements', value: C.q29OngoingPermits },
            { label: 'Comments', value: C.q29Comments },
        ]},
    ];
    y = await renderTxtQs(doc, data, qsC, y, cw, maxY, contPage, drawFooter,
        [{ beforeQ: '15', title: 'General' }, { beforeQ: '25', title: 'Topography/Surface Drainage' }, { beforeQ: '28', title: 'Water Features/Waterbodies' }]);

    // ══════════════════════════════════════════════════════════════
    // SECTION D — ENVIRONMENTAL PROTECTION AND SAFETY
    // ══════════════════════════════════════════════════════════════
    y = await startSectionPage(false);
    y = drawSectionBar(doc, 'D \u2013 ENVIRONMENTAL PROTECTION AND SAFETY', y, cw);
    const qsD = [
        { num: '30', text: 'Signage and Lease Identification', fields: [
            { label: 'Signage Compliance', value: D.q30Signage, type: 'radio', options: ['In compliance', 'Not in compliance', 'N/A'] },
            { label: 'Visible', value: D.q30Visible, type: 'radio', options: ['Yes', 'No', 'N/A'] },
            { label: 'Legible', value: D.q30Legible, type: 'radio', options: ['Yes', 'No', 'N/A'] },
            { label: 'Hotline Number Posted', value: D.q30Hotline, type: 'radio', options: ['Yes', 'No', 'N/A'] },
            { label: 'Comments', value: D.q30Comments },
        ]},
        { num: '31', text: 'Fencing and Lease Boundary', fields: [
            { label: 'Fencing Present', value: D.q31Fencing, type: 'radio', options: ['Yes', 'No', 'N/A'] },
            { label: 'Human Restriction', value: D.q31HumanRestriction, type: 'radio', options: ['Yes', 'No', 'N/A'] },
            { label: 'Livestock Restriction', value: D.q31LivestockRestriction, type: 'radio', options: ['Yes', 'No', 'N/A'] },
            { label: 'Fence Maintained', value: D.q31Maintained, type: 'radio', options: ['Yes', 'No', 'N/A'] },
            { label: 'Texas Gate Condition', value: D.q31TexasGateCondition },
            { label: 'Comments', value: D.q31Comments },
        ]},
        { num: '32', text: 'Culverts and Drainage Structures', fields: [
            { label: 'Culverts Present', value: D.q32Culverts, type: 'radio', options: ['Yes', 'No', 'N/A'] },
            { label: 'Properly Installed', value: D.q32ProperlyInstalled, type: 'radio', options: ['Yes', 'No', 'N/A'] },
            { label: 'Correct Size', value: D.q32CorrectSize, type: 'radio', options: ['Yes', 'No', 'N/A'] },
            { label: 'Properly Maintained', value: D.q32ProperlyMaintained, type: 'radio', options: ['Yes', 'No', 'N/A'] },
            { label: 'Comments', value: D.q32Comments },
        ]},
        { num: '33', text: 'Surface Casing Vent', fields: [
            { label: 'Surface Casing Vent Present', value: D.q33SurfaceCasingVent, type: 'radio', options: ['Yes', 'No', 'N/A'] },
            { label: 'Open / Closed', value: D.q33OpenClosed },
            { label: 'Clearance', value: D.q33Clearance },
            { label: 'Comments', value: D.q33Comments },
        ]},
        { num: '34', text: 'Wellhead Valves and Bull Plugs', fields: [
            { label: 'Wellhead Valves', value: D.q34WellheadValves, type: 'radio', options: ['Yes', 'No', 'N/A'] },
            { label: 'Bull Plugs', value: D.q34BullPlugs, type: 'radio', options: ['Yes', 'No', 'N/A'] },
            { label: 'Comments', value: D.q34Comments },
        ]},
        { num: '35', text: 'Chemical Storage and Containment', fields: [
            { label: 'Chemical Storage Present', value: D.q35ChemicalStorage, type: 'radio', options: ['Yes', 'No', 'N/A'] },
            { label: 'Sealed / Contained', value: D.q35Sealed, type: 'radio', options: ['Yes', 'No', 'N/A'] },
            { label: 'WHMIS Labels', value: D.q35Whmis, type: 'radio', options: ['Yes', 'No', 'N/A'] },
            { label: 'MSDS Available', value: D.q35Msds, type: 'radio', options: ['Yes', 'No', 'N/A'] },
            { label: 'Comments', value: D.q35Comments },
        ]},
        { num: '36', text: 'Tanks and Vessels', fields: [
            { label: 'Tanks Present', value: D.q36Tanks, type: 'radio', options: ['Yes', 'No', 'N/A'] },
            { label: 'In Good Repair', value: D.q36InGoodRepair, type: 'radio', options: ['Yes', 'No', 'N/A'] },
            { label: 'Comments', value: D.q36Comments },
        ]},
        { num: '37', text: 'Reportable Spills', fields: [
            { label: 'Reportable Spills', value: D.q37ReportableSpills, type: 'radio', options: ['Yes', 'No', 'N/A'] },
            { label: 'Spill Date', value: D.q37SpillDate },
            { label: 'Substance', value: D.q37Substance },
            { label: 'Volume', value: D.q37Volume },
            { label: 'Authorities Notified', value: D.q37Notified, type: 'radio', options: ['Yes', 'No', 'N/A'] },
            { label: 'Comments', value: D.q37Comments },
        ]},
        { num: '38', text: 'Surface Staining / Contamination', fields: [
            { label: 'Surface Staining Present', value: D.q38SurfaceStaining, type: 'radio', options: ['Yes', 'No', 'N/A'] },
            { label: 'On-Site', value: D.q38OnSite, type: 'radio', options: ['Yes', 'No', 'N/A'] },
            { label: 'Off-Site', value: D.q38OffSite, type: 'radio', options: ['Yes', 'No', 'N/A'] },
            { label: 'Comments', value: D.q38Comments },
        ]},
        { num: '39', text: 'Emergency Response Plan (ERP)', fields: [
            { label: 'ERP Compliance', value: D.q39Erp, type: 'radio', options: ['In compliance', 'Not in compliance', 'N/A'] },
            { label: 'ERP in Place', value: D.q39ErpInPlace, type: 'radio', options: ['Yes', 'No', 'N/A'] },
            { label: 'Comments', value: D.q39Comments },
        ]},
        { num: '40', text: 'ERP Exercise / Practice', fields: [
            { label: 'ERP Exercise Conducted', value: D.q40ErpExercise, type: 'radio', options: ['Yes', 'No', 'N/A'] },
            { label: 'Date', value: D.q40Date },
            { label: 'Comments', value: D.q40Comments },
        ]},
        { num: '41', text: 'Excavation Hazards', fields: [
            { label: 'Excavation Hazards Present', value: D.q41ExcavationHazards, type: 'radio', options: ['Yes', 'No', 'N/A'] },
            { label: 'Comments', value: D.q41Comments },
        ]},
    ];
    y = await renderTxtQs(doc, data, qsD, y, cw, maxY, contPage, drawFooter,
        [{ beforeQ: '30', title: 'Lease Access and Security' }, { beforeQ: '35', title: 'Chemical Storage and Containment' }, { beforeQ: '37', title: 'Spill Prevention, Response and Reporting' }, { beforeQ: '39', title: 'Emergency Response Plan (ERP) and Safety' }]);

    // ══════════════════════════════════════════════════════════════
    // SECTION E — OVERALL / SUMMARY
    // ══════════════════════════════════════════════════════════════
    y = await startSectionPage(false);
    y = drawSectionBar(doc, 'E \u2013 OVERALL/SUMMARY ENVIRONMENTAL AUDIT', y, cw);
    const qsE = [
        { num: '42', text: 'IOGC Environmental Protection Terms Compliance', fields: [
            { label: 'IOGC Terms Compliance', value: E.q42IogcTerms, type: 'radio', options: ['In compliance', 'Not in compliance', 'N/A'] },
            { label: 'Comments', value: E.q42Comments },
        ]},
        { num: '43', text: 'Compliance with Other Applicable Regulations', fields: [
            { label: 'Other Regulations Compliance', value: E.q43OtherRegulations, type: 'radio', options: ['In compliance', 'Not in compliance', 'N/A'] },
            { label: 'Comments', value: E.q43Comments },
        ]},
        { num: '44', text: 'Summary of Non-Compliance Issues', fields: [
            { label: 'Summary', value: E.q44SummaryNonCompliance, primary: true },
        ]},
        { num: '45', text: 'Non-Compliance Follow-Up Requirements', fields: [
            { label: 'Follow-Up Requirements', value: E.q45NonComplianceFollowUp, primary: true },
        ]},
        { num: '46', text: 'Overall Compliance Status', fields: [
            { label: 'Overall Compliance', value: E.q46OverallCompliance, type: 'radio', options: ['In compliance', 'Not in compliance', 'N/A'] },
            { label: 'Comments', value: E.q46Comments },
        ]},
    ];
    y = await renderTxtQs(doc, data, qsE, y, cw, maxY, contPage, drawFooter, null);

    // ══════════════════════════════════════════════════════════════
    // SECTION F — ATTACHMENTS (text descriptions)
    // ══════════════════════════════════════════════════════════════
    y = await startSectionPage(false);
    y = drawSectionBar(doc, 'F \u2013 ENVIRONMENTAL AUDIT ATTACHMENTS', y, cw);
    const attachItems = [
        { id: 'F-1', title: 'Copy of the IOGC Environmental Protection Terms Letter', desc: 'A copy of the current IOGC Environmental Protection Terms Letter applicable to this lease must be included as an attachment to this audit report.' },
        { id: 'F-2', title: 'Site Sketch and Survey', desc: 'A site sketch or survey drawing showing all surface structures, berm locations, fencing, gates, access roads, sumps, and any other relevant features must be included.' },
        { id: 'F-3', title: 'Site Photographs', desc: 'The audit must include captioned colour photographs. The location and direction of photographs should be indicated on a site sketch or diagram.' },
        { id: 'F-4', title: 'Follow-Up Compliance Reporting \u2013 Photo Log', desc: 'For leases with non-compliance items, include captioned photographs and written descriptions of all corrective actions taken.' },
    ];
    for (const item of attachItems) {
        y = await ensureSpace(22, y);
        doc.setFontSize(9); doc.setFont('times', 'bold'); doc.setTextColor(...TEAL);
        doc.text(`${item.id}  \u2013  ${item.title}`, CM, y); y += 5;
        doc.setFont('times', 'normal'); doc.setTextColor(...BLACK); doc.setFontSize(8.5);
        const lines = doc.splitTextToSize(item.desc, cw);
        doc.text(lines, CM, y); y += doc.getTextDimensions(lines).h + 6;
    }
    drawFooter(doc, data);

    // ══════════════════════════════════════════════════════════════
    // PHOTO LOG — F-3 / F-4  (disabled — photos handled externally)
    // ══════════════════════════════════════════════════════════════
    if (false) {
    const photos = (data.photos || []);
    const CAP_W = Math.round(cw * 0.33);
    const IMG_W = cw - CAP_W;
    const ROW_H = 88;
    const CPAD  = 3;
    const lineHpx = 7.5 * 1.15 * (25.4 / 72);

    const drawPhotoRow = (ph, px, py, rowH) => {
        if (!rowH) rowH = ROW_H;
        doc.setDrawColor(...TEAL); doc.setLineWidth(LW_GRID);
        doc.rect(px, py, cw, rowH, 'S');
        doc.line(px + CAP_W, py, px + CAP_W, py + rowH);
        doc.setFillColor(248, 248, 248);
        doc.rect(px, py, CAP_W, rowH, 'F');

        // Badge
        doc.setFillColor(...TEAL);
        doc.rect(px + CPAD - 1, py + CPAD - 1, CAP_W - CPAD * 2 + 2, 7, 'F');
        doc.setFontSize(8); doc.setFont('times', 'bold'); doc.setTextColor(...WHITE);
        doc.text(ph.photoNumber ? `Photo ${ph.photoNumber}` : 'Photo', px + CAP_W / 2, py + CPAD + 3.5, { align: 'center' });
        doc.setTextColor(...BLACK);

        let ty = py + CPAD + 9;
        doc.setDrawColor(...LIGHT_LINE); doc.setLineWidth(LW_LIGHT);
        doc.line(px + 1, ty - 1, px + CAP_W - 1, ty - 1);

        // Description
        const descMaxW = CAP_W - CPAD * 2 - 8;
        doc.setFontSize(7.5); doc.setFont('times', 'bold'); doc.setTextColor(...BLACK);
        const descLines = doc.splitTextToSize(ph.description || '', descMaxW);
        const metaH = 14;
        const bottomLimit = py + rowH - CPAD - metaH;
        const maxLines = Math.max(1, Math.min(Math.floor((bottomLimit - ty - lineHpx) / lineHpx), descLines.length));
        if (descLines.length > 0) {
            doc.text(descLines.slice(0, maxLines), px + CPAD, ty + lineHpx);
            ty += maxLines * lineHpx + 3;
        }

        // Metadata
        doc.setFont('times', 'normal'); doc.setFontSize(7); doc.setTextColor(60, 60, 60);
        const metaW = CAP_W - CPAD * 2 - 5;
        if (ph.location) {
            doc.setFont('times', 'bold'); doc.text('Location:', px + CPAD, ty);
            doc.setFont('times', 'normal');
            doc.text((doc.splitTextToSize(ph.location, metaW - 14)[0] || ''), px + CPAD + 14, ty);
            ty += 4;
        }
        if (ph.direction) {
            doc.setFont('times', 'bold'); doc.text('Direction:', px + CPAD, ty);
            doc.setFont('times', 'normal');
            doc.text(ph.direction, px + CPAD + 15, ty);
            ty += 4;
        }
        if (ph.date) {
            doc.setFont('times', 'bold'); doc.text('Date:', px + CPAD, ty);
            doc.setFont('times', 'normal'); doc.text(ph.date, px + CPAD + 9, ty);
        }
        doc.setTextColor(...BLACK);

        // Photo image
        const imgX = px + CAP_W;
        if (ph.imageUrl) {
            try {
                const fmt = (ph.imageUrl || '').includes('data:image/png') ? 'PNG' : 'JPEG';
                doc.addImage(ph.imageUrl, fmt, imgX + 0.5, py + 0.5, IMG_W - 1, rowH - 1);
            } catch { /* skip */ }
        } else {
            doc.setFontSize(9); doc.setFont('times', 'italic'); doc.setTextColor(170, 170, 170);
            doc.text('[ Photograph ]', imgX + IMG_W / 2, py + rowH / 2, { align: 'center' });
            doc.setTextColor(...BLACK);
        }
    };

    const drawPhotoPageHdr = (title) => {
        let py = CM + 14;
        doc.setFontSize(13); doc.setFont('times', 'bold'); doc.setTextColor(...TEAL);
        doc.text(title || 'PHOTOGRAPHIC LOG', pw / 2, py, { align: 'center' });
        py += 3;
        doc.setDrawColor(...TEAL); doc.setLineWidth(0.5);
        doc.line(CM, py, CM + cw, py);
        py += 5;
        // Metadata table: left col / right col
        const half = cw / 2;
        const lx = CM; const rx = CM + half + 2;
        doc.setFontSize(8.5); doc.setTextColor(...BLACK);
        const meta = [
            ['Proponent', c.lesseeName || data.proponent || ''],
            ['Project Name', data.projectName || ''],
            ['Location', c.legalLocation || data.location || ''],
        ];
        const metaR = [
            ['Date', c.auditDate || data.date || ''],
            ['X-Terra Project', data.projectNumber || ''],
            ['Surface Lease', c.iogcFileNumber || data.surfaceLeaseOS || ''],
        ];
        for (let i = 0; i < meta.length; i++) {
            const ry = py + i * 5;
            const lbl = `${meta[i][0]}: `; doc.setFont('times', 'bold'); doc.text(lbl, lx, ry);
            doc.setFont('times', 'normal'); doc.text(meta[i][1], lx + doc.getTextWidth(lbl), ry);
            const lblR = `${metaR[i][0]}: `; doc.setFont('times', 'bold'); doc.text(lblR, rx, ry);
            doc.setFont('times', 'normal'); doc.text(metaR[i][1], rx + doc.getTextWidth(lblR), ry);
        }
        py += meta.length * 5 + 2;
        doc.setDrawColor(...LIGHT_LINE); doc.setLineWidth(0.3);
        doc.line(CM, py, CM + cw, py);
        py += 3;
        return py;
    };

    // Split into site photos vs follow-up photos based on a tag, or just render all as site photos
    const sitePhotos   = photos.filter(p => !p.isFollowUp);
    const followUpPhts = photos.filter(p => p.isFollowUp);

    const renderPhotoSection = async (photoArr, title) => {
        if (photoArr.length === 0) return;
        const totalPages = Math.ceil(photoArr.length / 2);
        for (let i = 0; i < photoArr.length; i += 2) {
            await contPage();
            const pageNum = Math.floor(i / 2) + 1;
            const py = drawPhotoPageHdr(title);
            // Page number bottom-right inside the page (before footer)
            doc.setFontSize(7.5); doc.setFont('times', 'normal'); doc.setTextColor(80, 80, 80);
            doc.text(`Page ${pageNum} of ${totalPages}`, pw - CM, py - 3, { align: 'right' });
            doc.setTextColor(...BLACK);
            // Available height for two photo rows
            const availH = maxY - py - 4;
            const rowH2 = Math.floor(availH / 2);
            drawPhotoRow(photoArr[i], CM, py, rowH2);
            const row2Y = py + rowH2 + 2;
            if (i + 1 < photoArr.length) {
                drawPhotoRow(photoArr[i + 1], CM, row2Y, rowH2);
            } else {
                doc.setDrawColor(...TEAL); doc.setLineWidth(LW_GRID);
                doc.rect(CM, row2Y, cw, rowH2, 'S');
                doc.line(CM + CAP_W, row2Y, CM + CAP_W, row2Y + rowH2);
                doc.setFillColor(248, 248, 248);
                doc.rect(CM, row2Y, CAP_W, rowH2, 'F');
            }
            drawFooter(doc, data);
        }
    };

    if (sitePhotos.length > 0) {
        await renderPhotoSection(sitePhotos, 'PHOTOGRAPHIC LOG');
    } else {
        // Show two placeholder rows so the report always has a photo log section
        const placeholders = [{ photoNumber: '1' }, { photoNumber: '2' }];
        await contPage();
        const py = drawPhotoPageHdr('PHOTOGRAPHIC LOG');
        drawPhotoRow(placeholders[0], CM, py, ROW_H);
        drawPhotoRow(placeholders[1], CM, py + ROW_H + 2, ROW_H);
        drawFooter(doc, data);
    }
    if (followUpPhts.length > 0) {
        await renderPhotoSection(followUpPhts, 'FOLLOW UP COMPLIANCE REPORTING');
    }
    } // end if (false) — photo log disabled

    // ══════════════════════════════════════════════════════════════
    // LIMITATIONS AND QUALIFICATIONS
    // ══════════════════════════════════════════════════════════════
    y = await ensureSpace(50, y);
    y += 6;
    doc.setFontSize(11); doc.setFont('times', 'bold'); doc.setTextColor(...TEAL);
    doc.text('3.  LIMITATIONS AND QUALIFICATIONS', CM, y);
    doc.setTextColor(...BLACK); y += 3;
    doc.setDrawColor(...TEAL); doc.setLineWidth(0.4);
    doc.line(CM, y, CM + cw, y); y += 6;

    const limitationsText = 'This document is intended for the exclusive use of the company, organization, or individual for whom it has been prepared. X-Terra Environmental Services Ltd. (X-Terra) does not accept any responsibility to any third party for the use of information presented in this report, or decisions made or actions taken based on its content. Other than by the named client, copying or distribution of this report or use of or reliance on the information contained herein, in whole or in part, is not permitted without the expressed written permission of X-Terra. Nothing in this report is intended to constitute or provide a \u201clegal opinion\u201d. In conducting the environmental audit, X-Terra has exercised reasonable skill, care, and diligence to assess the information acquired during the preparation of this report. No other representations, warranties or guarantees are made concerning the accuracy or completeness of the data or conclusions contained within this report, including no assurance that this assessment has uncovered all potential liabilities associated with the identified property. This report provides an assessment of environmental site conditions at the time of the environmental audit and was based on information obtained by and/or provided to X-Terra. Activities at the property subsequent to X-Terra\u2019s assessment may have significantly altered the property\u2019s condition. There is a potential for unknown, unidentified, or unforeseen surface and subsurface environmental conditions to be different than summarized within this report. There are no assurances regarding the accuracy and completeness of this information. All information received from the client or third parties in the preparation of this report has been assumed by X-Terra to be correct. X-Terra assumes no responsibility for any deficiency or inaccuracy in information received from others. Conclusions made within this report are a professional opinion at the time of the writing of this report, not a certification of the property\u2019s environmental condition. Any liability associated with the assessment is limited to the fees paid for the assessment and the final report.';
    doc.setFontSize(10); doc.setFont('times', 'normal'); doc.setTextColor(...BLACK);
    const limLines = doc.splitTextToSize(limitationsText, cw);
    doc.text(limLines, CM, y);
    y += doc.getTextDimensions(limLines).h + 4;

    drawFooter(doc, data);

    // Output
    const buffer   = doc.output('arraybuffer');
    const loc      = (c.legalLocation || data.location || 'iogc_audit').replace(/[^a-zA-Z0-9\-_]/g, '_').toLowerCase();
    const filename = `${loc}_iogc_audit.pdf`;

    // Merge Section F attachments (base64-encoded PDFs) into the output
    const sectionF = data.sectionF;
    const attachments = sectionF ? [
        sectionF.termsLetter, sectionF.siteSketch,
        sectionF.sitePhotos, sectionF.followUpReport,
    ].filter(a => a?.included && a?.fileData) : [];

    if (attachments.length === 0) {
        return { buffer: new Uint8Array(buffer), filename };
    }

    const mainPdf = await PDFDocument.load(buffer);
    for (const att of attachments) {
        try {
            const attBytes = Buffer.from(att.fileData, 'base64');
            const attPdf = await PDFDocument.load(attBytes);
            const indices = Array.from({ length: attPdf.getPageCount() }, (_, i) => i);
            const copiedPages = await mainPdf.copyPages(attPdf, indices);
            for (const page of copiedPages) mainPdf.addPage(page);
        } catch (attErr) {
            console.warn(`Failed to embed attachment "${att.fileName}":`, attErr.message);
        }
    }
    return { buffer: await mainPdf.save(), filename };
}

module.exports = { generateIogcPdf };
