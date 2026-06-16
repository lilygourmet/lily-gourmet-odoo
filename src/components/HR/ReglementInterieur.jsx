import { useState } from 'react'
import { Printer } from 'lucide-react'

// Règlement intérieur résumé (FR + AR), avec cases à cocher ☐ — affichage + impression.

const STYLE = `
<style>
  .ri-doc { font-family: 'Helvetica', Arial, sans-serif; color: #1a1a1a; line-height: 1.55; font-size: 13px; max-width: 800px; margin: 0 auto; }
  .ri-doc h1 { font-size: 22px; color: #7a1f3d; margin: 0 0 2px; }
  .ri-doc .ri-sub { color: #555; font-style: italic; margin: 0 0 16px; }
  .ri-doc h2 { font-size: 15px; color: #fff; background: #7a1f3d; padding: 5px 10px; border-radius: 5px; margin: 18px 0 8px; }
  .ri-doc ul { margin: 6px 0; padding-left: 6px; list-style: none; }
  .ri-doc li { margin: 5px 0; }
  .ri-doc .cb { display: inline-block; width: 15px; height: 15px; border: 1.5px solid #7a1f3d; border-radius: 3px; margin-right: 7px; vertical-align: -2px; }
  .ri-doc .det { color: #555; font-size: 12px; }
  .ri-doc table { border-collapse: collapse; width: 100%; margin: 8px 0; font-size: 12px; }
  .ri-doc th, .ri-doc td { border: 1px solid #c9a9b4; padding: 5px 8px; text-align: left; }
  .ri-doc th { background: #f3e6ea; color: #7a1f3d; }
  .ri-doc .warn { background: #fff6e5; border-left: 4px solid #e0a800; padding: 6px 10px; margin: 8px 0; }
  .ri-doc .note { color: #555; font-size: 11.5px; font-style: italic; }
  .ri-doc .sign { margin-top: 26px; border-top: 2px solid #7a1f3d; padding-top: 12px; font-size: 13px; }
  .ri-doc .sign .line { margin-top: 22px; }
  /* Arabe RTL */
  .ri-rtl { direction: rtl; text-align: right; font-size: 14.5px; }
  .ri-rtl ul { padding-left: 0; padding-right: 6px; }
  .ri-rtl .cb { margin-right: 0; margin-left: 7px; }
  .ri-rtl th, .ri-rtl td { text-align: right; }
  .ri-rtl .warn { border-left: none; border-right: 4px solid #e0a800; }
  @media print { @page { margin: 14mm; } .ri-doc h2 { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>`

const CB = '<span class="cb"></span>'

const FR_BODY = `
<div class="ri-doc">
  <h1>📜 Règlement intérieur — Lily Gourmet</h1>
  <p class="ri-sub">L &amp; N Gourmet — l'essentiel à connaître (nouvel arrivant)</p>

  <h2>1. À l'embauche — documents à fournir</h2>
  <ul>
    <li>${CB}Copie CIN + certificat de résidence + 2 photos</li>
    <li>${CB}RIB bancaire</li>
    <li>${CB}Carte CNSS (si tu en as une) + diplômes / attestations</li>
    <li>${CB}Certificats de travail (dernier employeur)</li>
    <li>${CB}Extrait de casier judiciaire</li>
    <li>${CB}Certificat médical si demandé</li>
  </ul>
  <div class="warn">⚠️ Toute fausse déclaration = licenciement immédiat, sans préavis.</div>

  <h2>2. Période d'essai</h2>
  <ul><li>${CB}Employés : <b>1 mois et demi</b> · Cadres : <b>3 mois</b> (renouvelable 1 fois)</li></ul>
  <p class="note">Pendant l'essai, chacun peut arrêter sans préavis ni indemnité.</p>

  <h2>3. Préavis (fin de contrat)</h2>
  <table>
    <tr><th>Ancienneté</th><th>Employés / ouvriers</th><th>Cadres</th></tr>
    <tr><td>Moins d'1 an</td><td>8 jours</td><td>1 mois</td></tr>
    <tr><td>1 à 5 ans</td><td>1 mois</td><td>2 mois</td></tr>
    <tr><td>Plus de 5 ans</td><td>2 mois</td><td>3 mois</td></tr>
  </table>
  <p class="note">Pendant la période d'essai : aucun préavis.</p>

  <h2>4. Horaires &amp; pointage</h2>
  <ul>
    <li>${CB}44 h/semaine, horaires affichés <span class="det">(peuvent changer : Ramadan, été…)</span></li>
    <li>${CB}Pointer soi-même en arrivant et en partant <span class="det">(après avoir mis la tenue / avant de l'enlever)</span></li>
    <li>${CB}Pointer même pour une courte sortie/pause <span class="det">(jamais faire pointer un collègue)</span></li>
    <li>${CB}Retard interdit et non payé</li>
    <li>${CB}Partir avant la fin = autorisation du chef obligatoire</li>
  </ul>

  <h2>5. Tenue &amp; hygiène (priorité — métier alimentaire)</h2>
  <ul>
    <li>${CB}Tenue de travail propre, chaussures adaptées</li>
    <li>${CB}Cuisine / contact aliments : mains lavées, ongles courts, charlotte (cheveux)</li>
    <li>${CB}Vente : tenue + gants, politesse avec les clients</li>
    <li>${CB}Caisse : enregistrer TOUTES les ventes, aucun manque injustifié</li>
    <li>${CB}Ne pas sortir du local en tenue de travail</li>
  </ul>

  <h2>6. Interdictions strictes</h2>
  <ul>
    <li>${CB}Pas de téléphone perso au travail (tiktok/lives…)</li>
    <li>${CB}Pas de cigarette, alcool, drogue sur le lieu de travail</li>
    <li>${CB}Pas dormir ni manger hors de l'endroit prévu</li>
    <li>${CB}Pas de violence ni manque de respect (clients/collègues)</li>
    <li>${CB}Pas de relations perso/commerciales avec les clients, ni vendre ses propres produits</li>
    <li>${CB}Ne pas quitter son poste sans remplaçant</li>
    <li>${CB}Garder le secret professionnel</li>
    <li>${CB}Signaler tout changement d'adresse à la direction</li>
  </ul>

  <h2>7. Congés &amp; absences</h2>
  <ul>
    <li>${CB}Congé annuel : après 6 mois → 1,5 jour/mois travaillé <span class="det">(demande écrite + accord écrit AVANT de partir)</span></li>
    <li>${CB}Maladie : prévenir dans les 48 h <span class="det">(+ certificat médical)</span></li>
    <li>${CB}Contre-visite médicale possible <span class="det">(refus/absence = arrêt injustifié)</span></li>
    <li>${CB}Jours fériés payés (1 jour chacun) selon le calendrier officiel</li>
  </ul>
  <p><b>Absences familiales payées (détail) :</b></p>
  <table>
    <tr><th>Événement</th><th>Jours</th></tr>
    <tr><td>Mariage de l'employé(e)</td><td>4 jours</td></tr>
    <tr><td>Mariage d'un enfant (ou enfant du conjoint)</td><td>2 jours</td></tr>
    <tr><td>Naissance (congé du père)</td><td>3 jours</td></tr>
    <tr><td>Décès conjoint, enfant, petit-enfant, ascendant (ou enfant du conjoint)</td><td>3 jours</td></tr>
    <tr><td>Décès frère/sœur, ou frère/sœur/ascendant du conjoint</td><td>2 jours</td></tr>
    <tr><td>Circoncision</td><td>2 jours</td></tr>
    <tr><td>Opération chirurgicale du conjoint ou d'un enfant à charge</td><td>2 jours</td></tr>
  </table>
  <p class="note">Paie : payées seulement pour les salariés au mois, dans la limite de 2 j (mariage employé) et 1 j (décès conjoint/père/mère/enfant). Congé père indemnisé par la CNSS.</p>

  <h2>8. Salaire &amp; ancienneté</h2>
  <ul>
    <li>${CB}Payé 1×/mois <span class="det">(pas de salaire pour absence injustifiée)</span></li>
    <li>${CB}Prime d'ancienneté : 5 % (2 ans), 10 % (5 ans), 15 % (12 ans), 20 % (20 ans), 25 % (25 ans)</li>
  </ul>

  <h2>9. Sécurité</h2>
  <ul>
    <li>${CB}Utiliser les équipements de protection</li>
    <li>${CB}Accident de travail : prévenir la direction dans les 48 h</li>
  </ul>

  <h2>10. Formation</h2>
  <ul><li>${CB}Participer aux formations si la direction le demande (art. 28)</li></ul>

  <h2>11. Représentation des salariés</h2>
  <ul><li>${CB}Délégués des salariés (élus) ; comité d'entreprise et comité de sécurité &amp; hygiène à partir de 50 salariés (art. 58-60)</li></ul>

  <div class="sign">
    Je soussigné(e) <b>……………………………………………</b> déclare avoir lu, compris et accepté le présent règlement intérieur.
    <div class="line">Fait à ………………………, le ……/……/20……</div>
    <div class="line">Signature de l'employé(e) : …………………………………………</div>
  </div>
</div>`

const AR_BODY = `
<div class="ri-doc ri-rtl" dir="rtl">
  <h1>📜 النظام الداخلي — Lily Gourmet</h1>
  <p class="ri-sub">L &amp; N Gourmet — أهم ما يجب معرفته (للموظف الجديد)</p>

  <h2>1. عند التوظيف — الوثائق المطلوبة</h2>
  <ul>
    <li>${CB}نسخة من البطاقة الوطنية + شهادة السكنى + صورتان</li>
    <li>${CB}رقم الحساب البنكي (RIB)</li>
    <li>${CB}بطاقة الضمان الاجتماعي (CNSS) إن وجدت + الدبلومات/الشهادات</li>
    <li>${CB}شهادات العمل (آخر مشغّل)</li>
    <li>${CB}نسخة من السجل العدلي (بطاقة السوابق)</li>
    <li>${CB}شهادة طبية إذا طُلبت</li>
  </ul>
  <div class="warn">⚠️ كل تصريح كاذب = الفصل الفوري دون إشعار مسبق.</div>

  <h2>2. فترة الاختبار</h2>
  <ul><li>${CB}المستخدمون: <b>شهر ونصف</b> · الأطر: <b>ثلاثة أشهر</b> (قابلة للتجديد مرة واحدة)</li></ul>
  <p class="note">خلال فترة الاختبار، يمكن لأي طرف إنهاء العقد دون إشعار ولا تعويض.</p>

  <h2>3. أجل الإخطار (عند إنهاء العقد)</h2>
  <table>
    <tr><th>الأقدمية</th><th>المستخدمون / العمال</th><th>الأطر</th></tr>
    <tr><td>أقل من سنة</td><td>8 أيام</td><td>شهر</td></tr>
    <tr><td>من سنة إلى 5 سنوات</td><td>شهر</td><td>شهران</td></tr>
    <tr><td>أكثر من 5 سنوات</td><td>شهران</td><td>ثلاثة أشهر</td></tr>
  </table>
  <p class="note">خلال فترة الاختبار: لا يوجد إشعار مسبق.</p>

  <h2>4. أوقات العمل والتنقيط</h2>
  <ul>
    <li>${CB}44 ساعة في الأسبوع، الأوقات معلنة <span class="det">(قد تتغير: رمضان، العطلة الصيفية…)</span></li>
    <li>${CB}التنقيط شخصياً عند الدخول والخروج <span class="det">(بعد ارتداء بذلة العمل / قبل نزعها)</span></li>
    <li>${CB}التنقيط حتى عند مغادرة قصيرة أو استراحة <span class="det">(لا يجوز أن ينقّط عنك زميل)</span></li>
    <li>${CB}التأخر ممنوع وغير مؤدّى عنه</li>
    <li>${CB}المغادرة قبل نهاية الدوام = إذن من الرئيس المباشر إلزامي</li>
  </ul>

  <h2>5. اللباس والنظافة (أولوية — مجال غذائي)</h2>
  <ul>
    <li>${CB}بذلة عمل نظيفة، أحذية مناسبة</li>
    <li>${CB}المطبخ/ملامسة الأطعمة: غسل اليدين، أظافر قصيرة، قبعة للشعر</li>
    <li>${CB}البيع: بذلة + قفازات، اللباقة مع الزبناء</li>
    <li>${CB}الصندوق (Caisse): تسجيل كل المبيعات، لا نقص بدون مبرر</li>
    <li>${CB}عدم الخروج من المحل ببذلة العمل</li>
  </ul>

  <h2>6. ممنوعات صارمة</h2>
  <ul>
    <li>${CB}ممنوع الهاتف الشخصي أثناء العمل (تيكتوك/لايفات…)</li>
    <li>${CB}ممنوع التدخين، الكحول، المخدرات في مكان العمل</li>
    <li>${CB}ممنوع النوم أو الأكل خارج المكان المخصص</li>
    <li>${CB}ممنوع العنف أو قلة الاحترام (الزبناء/الزملاء)</li>
    <li>${CB}ممنوع العلاقات الشخصية/التجارية مع الزبناء، أو بيع منتجات لحسابك الخاص</li>
    <li>${CB}عدم مغادرة المنصب دون من يخلفه</li>
    <li>${CB}الحفاظ على السر المهني</li>
    <li>${CB}الإخبار بكل تغيير في العنوان للإدارة</li>
  </ul>

  <h2>7. العطل والتغيبات</h2>
  <ul>
    <li>${CB}العطلة السنوية: بعد 6 أشهر → يوم ونصف عن كل شهر عمل <span class="det">(طلب كتابي + موافقة كتابية قبل المغادرة)</span></li>
    <li>${CB}المرض: الإخبار خلال 48 ساعة <span class="det">(+ شهادة طبية)</span></li>
    <li>${CB}إمكانية الفحص الطبي المضاد <span class="det">(الرفض/الغياب = تغيب غير مبرر)</span></li>
    <li>${CB}أيام الأعياد المؤدّى عنها (يوم واحد لكل عيد) حسب التقويم الرسمي</li>
  </ul>
  <p><b>التغيبات العائلية المؤدّى عنها (التفصيل):</b></p>
  <table>
    <tr><th>الحدث</th><th>الأيام</th></tr>
    <tr><td>زواج الأجير(ة)</td><td>4 أيام</td></tr>
    <tr><td>زواج أحد الأبناء (أو ابن الزوج/الزوجة)</td><td>يومان</td></tr>
    <tr><td>الولادة (إجازة الأب)</td><td>3 أيام</td></tr>
    <tr><td>وفاة الزوج، ابن، حفيد، أصل (أو ابن الزوج/الزوجة)</td><td>3 أيام</td></tr>
    <tr><td>وفاة أخ/أخت، أو أخ/أخت/أصل الزوج</td><td>يومان</td></tr>
    <tr><td>الختان</td><td>يومان</td></tr>
    <tr><td>عملية جراحية للزوج أو لطفل مكفول</td><td>يومان</td></tr>
  </table>
  <p class="note">الأداء: تُؤدّى فقط للأجراء بالأجر الشهري، في حدود يومين (زواج الأجير) ويوم واحد (وفاة الزوج/الأب/الأم/الابن). إجازة الأب يعوّضها الصندوق الوطني للضمان الاجتماعي.</p>

  <h2>8. الأجر والأقدمية</h2>
  <ul>
    <li>${CB}يُؤدّى مرة في الشهر <span class="det">(لا أجر عن التغيب غير المبرر)</span></li>
    <li>${CB}علاوة الأقدمية: 5% (سنتان)، 10% (5 سنوات)، 15% (12 سنة)، 20% (20 سنة)، 25% (25 سنة)</li>
  </ul>

  <h2>9. السلامة</h2>
  <ul>
    <li>${CB}استعمال وسائل الوقاية</li>
    <li>${CB}حادثة الشغل: إخبار الإدارة خلال 48 ساعة</li>
  </ul>

  <h2>10. التكوين</h2>
  <ul><li>${CB}المشاركة في التكوينات إذا طلبت الإدارة ذلك (المادة 28)</li></ul>

  <h2>11. تمثيل الأجراء</h2>
  <ul><li>${CB}مندوبو الأجراء (منتخبون)؛ لجنة المقاولة ولجنة السلامة وحفظ الصحة ابتداء من 50 أجيراً (المواد 58-60)</li></ul>

  <div class="sign">
    أُقرّ أنا الموقّع(ة) أسفله <b>……………………………………………</b> بأنني اطّلعت على هذا النظام الداخلي وفهمته وقبلته.
    <div class="line">حُرّر بـ ………………………، بتاريخ ……/……/20……</div>
    <div class="line">توقيع الأجير(ة): …………………………………………</div>
  </div>
</div>`

export default function ReglementInterieur() {
  const [lang, setLang] = useState('fr')
  const body = lang === 'fr' ? FR_BODY : AR_BODY

  function printHtml(inner) {
    const w = window.open('', '_blank', 'width=820,height=950')
    if (!w) return
    w.document.write(`<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Règlement intérieur — Lily Gourmet</title></head><body>${STYLE}${inner}</body></html>`)
    w.document.close()
    w.focus()
    setTimeout(() => { w.print() }, 350)
  }

  const tabBtn = (v, label) => (
    <button type="button" onClick={() => setLang(v)} style={{
      padding: '7px 16px', fontSize: 13, border: 'none', borderRadius: 6, cursor: 'pointer',
      background: lang === v ? 'white' : 'transparent', color: lang === v ? '#1a0f0a' : '#4a3a30',
      fontWeight: lang === v ? 600 : 400,
    }}>{label}</button>
  )
  const printBtn = (onClick, label) => (
    <button type="button" onClick={onClick} style={{
      padding: '9px 16px', background: '#7a1f3d', color: 'white', border: 'none', borderRadius: 8,
      cursor: 'pointer', fontSize: 13, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 8,
    }}><Printer size={15} /> {label}</button>
  )

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 4, padding: 3, background: '#F4F0EA', borderRadius: 8 }}>
          {tabBtn('fr', 'Français')}
          {tabBtn('ar', 'العربية')}
        </div>
        {printBtn(() => printHtml(body), `Imprimer (${lang === 'fr' ? 'FR' : 'AR'})`)}
        {printBtn(() => printHtml(`${FR_BODY}<div style="page-break-before:always"></div>${AR_BODY}`), 'Imprimer FR + AR')}
      </div>
      <div style={{ border: '1px solid #e5d8c3', borderRadius: 10, padding: 20, background: 'white' }}
        dangerouslySetInnerHTML={{ __html: STYLE + body }} />
    </div>
  )
}
