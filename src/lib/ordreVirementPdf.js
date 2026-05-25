// src/lib/ordreVirementPdf.js
// Génération de l'ordre de virement PDF (côté client, via jsPDF chargé dynamiquement)
// Stack : React 19 + Vite — pas d'ajout de dépendance npm, on charge via CDN comme SheetJS

import logoLG from "/Logo_LG.jpg"; // si tu veux importer l'image; sinon utilise fetch (voir plus bas)

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
  // 2500 -> "2.500"  (séparateur point comme dans l'image)
}

// ----------------- Chargement du logo en base64 -----------------
async function loadLogoBase64() {
  try {
    const res = await fetch("/Logo_LG.jpg");
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onloadend = () => resolve(r.result);
      r.readAsDataURL(blob);
    });
  } catch {
    return null; // si le logo n'est pas dispo, on dessine un cercle bordeaux
  }
}

// ----------------- Génération principale -----------------
/**
 * @param {Object} params
 * @param {Object} params.societe - { nom, nom_complet, capital, adresse, rc, ice, compte_bancaire, banque_societe }
 * @param {Array}  params.employes - [{ nom, montant, banque, rib }]
 * @param {Date}   [params.date] - optionnelle, défaut = aujourd'hui
 * @param {string} [params.filename] - défaut "Ordre_virement_<societe>_<mois>.pdf"
 */
export async function genererOrdreVirementPDF({ societe, employes, date = new Date(), filename }) {
  const JsPDF = await loadJsPDF();
  const doc = new JsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const W = 210, H = 297;
  const MARGIN = 18;

  const BORDEAUX = [153, 53, 86];     // #993556
  const JAUNE = [255, 255, 0];
  const GRIS = [136, 136, 136];
  const BLANC = [255, 255, 255];
  const NOIR = [0, 0, 0];

  // ---- En-tête : logo + nom société (gauche) + date (droite) ----
  const logoB64 = await loadLogoBase64();
  if (logoB64) {
    try {
      doc.addImage(logoB64, "JPEG", MARGIN, 12, 22, 22);
    } catch {
      // fallback cercle si l'image plante
      doc.setFillColor(...BORDEAUX);
      doc.circle(MARGIN + 11, 23, 11, "F");
      doc.setTextColor(...BLANC);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      const initiales = societe.nom.includes("L&N") || societe.nom.includes("L N") ? "LN" : "LG";
      doc.text(initiales, MARGIN + 11, 25, { align: "center" });
    }
  } else {
    doc.setFillColor(...BORDEAUX);
    doc.circle(MARGIN + 11, 23, 11, "F");
    doc.setTextColor(...BLANC);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    const initiales = societe.nom.includes("L&N") || societe.nom.includes("L N") ? "LN" : "LG";
    doc.text(initiales, MARGIN + 11, 25, { align: "center" });
  }

  // Nom société à côté
  doc.setTextColor(...BORDEAUX);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(societe.nom, MARGIN + 28, 22);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.setTextColor(102, 102, 102);
  doc.text("Traiteur événementiel", MARGIN + 28, 28);

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
  y += 8;

  const corps =
    `Merci de bien vouloir réaliser les virements suivants au profit des bénéficiaires ` +
    `ci-dessous désignés, et ce, à partir de notre compte numéro ${societe.compte_bancaire} ` +
    `domicilié auprès de ${societe.banque_societe}.`;
  const lignesCorps = doc.splitTextToSize(corps, W - 2 * MARGIN);
  doc.text(lignesCorps, MARGIN, y);
  y += lignesCorps.length * 5 + 4;

  // ---- Tableau employés : 2 lignes par employé (comme dans les images) ----
  // On construit un tableau "plat" avec autoTable, en stylant ligne par ligne
  const body = [];
  const rowStyles = []; // ce qu'on appliquera ligne par ligne via didParseCell

  employes.forEach((emp, idx) => {
    const montantStr = formatMontant(emp.montant) + " MAD";
    const montantLettres = nombreEnLettres(emp.montant).toUpperCase();
    // Ligne 1 : Nom | Montant (jaune) | Lettres | DIRHAMS
    body.push([
      { content: emp.nom, _kind: "nom" },
      { content: montantStr, _kind: "montant" },
      { content: montantLettres, _kind: "lettres" },
      { content: "DIRHAMS", _kind: "dirhams" },
    ]);
    // Ligne 2 : Banque | RIB (colspan 3)
    body.push([
      { content: emp.banque, _kind: "banque" },
      { content: emp.rib, _kind: "rib", colSpan: 3 },
    ]);
  });

  doc.autoTable({
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    body,
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 10,
      cellPadding: 2.4,
      lineColor: GRIS,
      lineWidth: 0.2,
      textColor: NOIR,
      valign: "middle",
    },
    columnStyles: {
      0: { cellWidth: 50 },
      1: { cellWidth: 30, halign: "center" },
      2: { cellWidth: 75, halign: "center" },
      3: { cellWidth: 19, halign: "center" },
    },
    didParseCell: (data) => {
      const raw = data.cell.raw;
      if (!raw || typeof raw !== "object") return;
      const kind = raw._kind;
      if (kind === "nom" || kind === "banque" || kind === "dirhams") {
        data.cell.styles.fontStyle = "bold";
      }
      if (kind === "montant") {
        data.cell.styles.fillColor = JAUNE;
        data.cell.styles.fontStyle = "bold";
      }
      if (kind === "lettres") {
        data.cell.styles.fontSize = 9;
      }
    },
    // Empêcher de couper un employé sur 2 pages : on regroupe par paquet de 2 lignes
    rowPageBreak: "avoid",
  });

  // ---- Ligne TOTAL ----
  const total = employes.reduce((s, e) => s + Number(e.montant || 0), 0);
  const totalStr = formatMontant(total) + " MAD";
  const totalLettres = nombreEnLettres(total).toUpperCase();
  let yTotal = doc.lastAutoTable.finalY + 4;

  doc.autoTable({
    startY: yTotal,
    margin: { left: MARGIN, right: MARGIN },
    body: [["TOTAL", totalStr, totalLettres, "DIRHAMS"]],
    theme: "grid",
    styles: {
      font: "helvetica",
      fontStyle: "bold",
      fontSize: 11,
      cellPadding: 3,
      fillColor: BORDEAUX,
      textColor: BLANC,
      lineColor: BORDEAUX,
      lineWidth: 0.3,
      valign: "middle",
    },
    columnStyles: {
      0: { cellWidth: 50 },
      1: { cellWidth: 30, halign: "center" },
      2: { cellWidth: 75, halign: "center" },
      3: { cellWidth: 19, halign: "center" },
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
