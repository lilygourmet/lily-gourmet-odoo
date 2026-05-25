// src/lib/ordreVirementPdf.js
// Génération de l'ordre de virement PDF (côté client, via jsPDF chargé dynamiquement)
// Version Noir & Blanc (compatible impression N&B)

// ----------------- Chargement dynamique de jsPDF + autoTable -----------------
let jsPDFPromise = null;
function loadJsPDF() {
  if (jsPDFPromise) return jsPDFPromise;
  jsPDFPromise = new Promise((resolve, reject) => {
    if (window.jspdf?.jsPDF && window.jspdf.jsPDF.API.autoTable) {
      resolve(window.jspdf.jsPDF);
      return;
    }
    const s1 = document.createElement("script");
    s1.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
    s1.onload = () => {
      const s2 = document.createElement("script");
      s2.src =
        "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js";
      s2.onload = () => resolve(window.jspdf.jsPDF);
      s2.onerror = reject;
      document.body.appendChild(s2);
    };
    s1.onerror = reject;
    document.body.appendChild(s1);
  });
  return jsPDFPromise;
}

// ----------------- Nombre en lettres (français) -----------------
export function nombreEnLettres(n) {
  if (n === 0) return "zéro";
  const u = ["", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf",
             "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize",
             "dix-sept", "dix-huit", "dix-neuf"];
  const d = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante",
             "soixante", "quatre-vingt", "quatre-vingt"];

  const sousCent = (num) => {
    if (num < 20) return u[num];
    const t = Math.floor(num / 10), uu = num % 10;
    if (t === 7 || t === 9) {
      const rem = 10 + uu;
      const base = d[t];
      if (t === 7 && uu === 1) return base + "-et-onze";
      return base + "-" + u[rem];
    }
    let w = d[t];
    if (t === 8 && uu === 0) return w + "s";
    if (uu === 1 && t >= 2 && t <= 6) return w + "-et-un";
    if (uu === 0) return w;
    return w + "-" + u[uu];
  };

  const sousMille = (num) => {
    if (num < 100) return sousCent(num);
    const h = Math.floor(num / 100), reste = num % 100;
    if (h === 1) return reste === 0 ? "cent" : "cent " + sousCent(reste);
    if (reste === 0) return u[h] + " cents";
    return u[h] + " cent " + sousCent(reste);
  };

  const parts = [];
  const millions = Math.floor(n / 1_000_000);
  const milliers = Math.floor((n % 1_000_000) / 1000);
  const reste = n % 1000;

  if (millions > 0) parts.push(millions === 1 ? "un million" : sousMille(millions) + " millions");
  if (milliers > 0) parts.push(milliers === 1 ? "mille" : sousMille(milliers) + " mille");
  if (reste > 0) parts.push(sousMille(reste));

  return parts.join(" ");
}

// ----------------- Formatage montant -----------------
function formatMontant(m) {
  return Math.round(m).toLocaleString("fr-FR").replace(/\s/g, ".");
}

// ----------------- Chargement du logo en base64 -----------------
async function loadLogoBase64() {
  try {
    const res = await fetch("/Logo_LG.jpg");
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onloadend = () => resolve(r.result);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

// ----------------- Génération principale -----------------
/**
 * @param {Object} params
 * @param {Object} params.societe - { nom, nom_complet, capital, adresse, rc, ice, compte_bancaire, banque_societe }
 * @param {Array}  params.employes - [{ nom, montant, banque, rib }]
 * @param {Date}   [params.date]
 * @param {string} [params.filename]
 */
export async function genererOrdreVirementPDF({ societe, employes, date = new Date(), filename }) {
  const JsPDF = await loadJsPDF();
  const doc = new JsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const W = 210, H = 297;
  const MARGIN = 18;

  // ---- Couleurs N&B ----
  const NOIR = [0, 0, 0];
  const BLANC = [255, 255, 255];
  const GRIS_BORDURE = [136, 136, 136];
  const GRIS_CLAIR = [217, 217, 217];   // remplace l'ex-jaune fluo

  // ---- En-tête : logo + nom société (gauche) + date (droite) ----
  const logoB64 = await loadLogoBase64();
  let logoOK = false;
  if (logoB64) {
    try {
      doc.addImage(logoB64, "JPEG", MARGIN, 12, 22, 22);
      logoOK = true;
    } catch { logoOK = false; }
  }
  if (!logoOK) {
    // fallback : carré noir avec initiales blanches
    doc.setFillColor(...NOIR);
    doc.rect(MARGIN, 12, 22, 22, "F");
    doc.setTextColor(...BLANC);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    const initiales = societe.nom.includes("L&N") || societe.nom.includes("L N") ? "LN" : "LG";
    doc.text(initiales, MARGIN + 11, 25.5, { align: "center" });
  }

  // Nom société à droite du logo (noir, sans sous-titre)
  doc.setTextColor(...NOIR);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text(societe.nom, MARGIN + 26, 25);

  // Date à droite
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  doc.setTextColor(...NOIR);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`À Rabat, le ${dd}/${mm}/${yyyy}`, W - MARGIN, 18, { align: "right" });

  // ---- Objet ----
  let y = 50;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...NOIR);
  doc.text("Objet : Ordre de virement", MARGIN, y);
  y += 10;

  // ---- Corps ----
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.text("Madame, Monsieur,", MARGIN, y);
  y += 7;

  const corps =
    `Merci de bien vouloir réaliser les virements suivants au profit des bénéficiaires ` +
    `ci-dessous désignés, et ce, à partir de notre compte numéro ${societe.compte_bancaire} ` +
    `domicilié auprès de ${societe.banque_societe}.`;
  const lignesCorps = doc.splitTextToSize(corps, W - 2 * MARGIN);
  doc.text(lignesCorps, MARGIN, y);
  y += lignesCorps.length * 5 + 4;

  // ---- Tableau employés : un mini-tableau de 2 lignes par employé, séparés par un espace ----
  // Largeurs : Nom 45 | Montant 26 | Lettres 79 (gauche) | DIRHAMS 24
  const COL_W = [45, 26, 79, 24];

  employes.forEach((emp) => {
    const montantStr = formatMontant(emp.montant) + " MAD";
    const montantLettres = nombreEnLettres(emp.montant).toUpperCase();

    const body = [
      [
        { content: emp.nom, _kind: "nom" },
        { content: montantStr, _kind: "montant" },
        { content: montantLettres, _kind: "lettres" },
        { content: "DIRHAMS", _kind: "dirhams" },
      ],
      [
        { content: emp.banque || "—", _kind: "banque" },
        { content: emp.rib || "", _kind: "rib", colSpan: 3 },
      ],
    ];

    doc.autoTable({
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      body,
      theme: "grid",
      styles: {
        font: "helvetica",
        fontSize: 9,
        cellPadding: { top: 1.8, right: 4, bottom: 1.8, left: 4 },
        lineColor: GRIS_BORDURE,
        lineWidth: 0.2,
        textColor: NOIR,
        valign: "middle",
      },
      columnStyles: {
        0: { cellWidth: COL_W[0] },
        1: { cellWidth: COL_W[1], halign: "center" },
        2: { cellWidth: COL_W[2], halign: "left" },
        3: { cellWidth: COL_W[3], halign: "center" },
      },
      didParseCell: (data) => {
        const raw = data.cell.raw;
        if (!raw || typeof raw !== "object") return;
        const kind = raw._kind;
        if (kind === "nom" || kind === "banque" || kind === "dirhams") {
          data.cell.styles.fontStyle = "bold";
        }
        if (kind === "montant") {
          data.cell.styles.fillColor = GRIS_CLAIR;
          data.cell.styles.fontStyle = "bold";
        }
        if (kind === "lettres") {
          data.cell.styles.fontSize = 8;
        }
      },
      rowPageBreak: "avoid",
    });

    // ESPACE entre employés
    y = doc.lastAutoTable.finalY + 4;
  });

  // ---- Ligne TOTAL ----
  const total = employes.reduce((s, e) => s + Number(e.montant || 0), 0);
  const totalStr = formatMontant(total) + " MAD";
  const totalLettres = nombreEnLettres(total).toUpperCase();

  doc.autoTable({
    startY: y + 1,
    margin: { left: MARGIN, right: MARGIN },
    body: [[
      { content: "TOTAL", _kind: "t_label" },
      { content: totalStr, _kind: "t_montant" },
      { content: totalLettres, _kind: "t_lettres" },
      { content: "DIRHAMS", _kind: "t_dirhams" },
    ]],
    theme: "grid",
    styles: {
      font: "helvetica",
      fontStyle: "bold",
      fontSize: 10,
      cellPadding: { top: 2.5, right: 4, bottom: 2.5, left: 4 },
      fillColor: NOIR,
      textColor: BLANC,
      lineColor: NOIR,
      lineWidth: 0.3,
      valign: "middle",
    },
    columnStyles: {
      0: { cellWidth: COL_W[0] },
      1: { cellWidth: COL_W[1], halign: "center" },
      2: { cellWidth: COL_W[2], halign: "left", fontSize: 9 },
      3: { cellWidth: COL_W[3], halign: "center", fontSize: 9 },
    },
  });

  // ---- Signature ----
  let ySig = doc.lastAutoTable.finalY + 14;
  doc.setTextColor(...NOIR);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text("Cordialement,", MARGIN, ySig);
  ySig += 6;
  doc.setFont("helvetica", "bold");
  doc.text("La Direction", MARGIN, ySig);

  // ---- Pied de page société (centré tout en bas) ----
  doc.setFont("helvetica", "bolditalic");
  doc.setFontSize(8.5);
  doc.setTextColor(102, 102, 102);
  const piedLigne1 = `${societe.nom_complet}  ·  Capital : ${societe.capital}  ·  RC : ${societe.rc}  ·  ICE : ${societe.ice}`;
  doc.text(piedLigne1, W / 2, H - 22, { align: "center" });
  doc.setFont("helvetica", "italic");
  doc.text(societe.adresse, W / 2, H - 17, { align: "center" });

  // ---- Sauvegarde ----
  const monthFR = ["Janvier","Fevrier","Mars","Avril","Mai","Juin","Juillet","Aout","Septembre","Octobre","Novembre","Decembre"][date.getMonth()];
  const suffix = societe.nom.includes("L&N") || societe.nom.includes("L N") ? "LN_Gourmet" : "LG_Traiteur";
  const finalName = filename || `Ordre_virement_${suffix}_${monthFR}_${yyyy}.pdf`;
  doc.save(finalName);
}
