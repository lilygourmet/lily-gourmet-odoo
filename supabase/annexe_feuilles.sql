-- ============================================================
-- LA FEUILLE DE FOURNÉE, SUIVIE DE L'IMPRESSION À LA DÉCLARATION.
--
-- Le problème (Layla, 2026-09-19) : « les pâtissiers impriment les recettes,
-- prennent les ingrédients, font les recettes, mais ne déclarent pas ».
-- Aujourd'hui les 8 déclarations du jour sont toutes tombées en 35 minutes :
-- c'est un rattrapage groupé, pas du travail déclaré au fil de l'eau.
--
-- LA RÈGLE, ET C'EST LAYLA QUI L'A TROUVÉE :
--   imprimer n'engage à RIEN — on peut imprimer et ne jamais aller chercher la
--   marchandise. **C'est le moment où l'économe DONNE qui engage.** À partir de
--   là, la déclaration est due, et l'app ne l'oublie plus.
--
-- Chaque feuille imprimée porte un QR = l'`id` de sa ligne ici. Deux papiers,
-- deux gestes, et ils ne se mélangent pas parce qu'ils ne restent pas au même
-- endroit :
--   • la DEMANDE À L'ÉCONOMAT reste chez l'économe → son QR dit « ✓ Donné » ;
--   • la FEUILLE DE RECETTE part avec le pâtissier → son QR dit « déclarer ».
--
-- ⚠️ `id` EST LE JETON. Il est dans le QR, sur du papier, et il ouvre une page
-- SANS connexion : les mains sont farineuses, personne ne tape un mot de passe.
-- D'où l'`uuid` (impossible à deviner), et surtout : tout passe par l'API avec
-- la clé de service — jamais d'écriture en accès anonyme (voir [securite-rls]).
--
-- À exécuter dans Supabase. Relançable sans risque.
-- ============================================================

CREATE TABLE IF NOT EXISTS annexe_feuilles (
  id            UUID PRIMARY KEY,
  jour          DATE NOT NULL DEFAULT (now() AT TIME ZONE 'Africa/Casablanca')::date,

  -- Ce qu'il y a sur le papier.
  produit       TEXT NOT NULL,
  libelle       TEXT,
  unite         TEXT,
  qty_prevue    NUMERIC,
  pour          TEXT,               -- le gâteau d'où vient la fournée, s'il y en a un

  -- 1. IMPRIMÉ — rien n'est dû encore.
  imprime_par   UUID REFERENCES profiles(id),
  imprime_le    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- 2. DONNÉ par l'économe — c'est ICI que la déclaration devient due.
  donne_par     UUID REFERENCES profiles(id),
  donne_le      TIMESTAMPTZ,

  -- 3. DÉCLARÉ — ou dit « pas faite », qui est une réponse valable.
  --    ⚠️ Sans porte de sortie, ils arrêteraient de passer par l'économe, et on
  --    perdrait justement la trace qu'on cherche à construire.
  declare_le    TIMESTAMPTZ,
  declare_qty   NUMERIC,
  fabrication_id BIGINT,            -- la ligne de prod_fabrications créée
  pas_faite_le  TIMESTAMPTZ,
  motif         TEXT
);

COMMENT ON TABLE annexe_feuilles IS
  'Une feuille de fournée imprimée, suivie jusqu''à sa déclaration. L''id est le jeton du QR code.';
COMMENT ON COLUMN annexe_feuilles.donne_le IS
  'Quand l''économe a donné la marchandise. C''est CE moment qui rend la déclaration due — pas l''impression.';
COMMENT ON COLUMN annexe_feuilles.pas_faite_le IS
  'Réponse valable : servi mais pas fait. Sans cette issue, la contrainte se contournerait.';

-- Les deux écrans qui liront cette table : « à donner » chez l'économe,
-- « à déclarer » chez les pâtissiers. Les deux regardent le jour en cours.
CREATE INDEX IF NOT EXISTS annexe_feuilles_jour_idx ON annexe_feuilles (jour DESC);
CREATE INDEX IF NOT EXISTS annexe_feuilles_a_declarer_idx
  ON annexe_feuilles (donne_le)
  WHERE donne_le IS NOT NULL AND declare_le IS NULL AND pas_faite_le IS NULL;

-- ⚠️ RIEN N'EST LISIBLE NI MODIFIABLE EN ACCÈS ANONYME. La page du QR n'attaque
-- pas Supabase : elle passe par /api/fab-annexe, qui tient la clé de service et
-- vérifie le jeton. Voir la faille anon fermée le 2026-06-05.
ALTER TABLE annexe_feuilles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS annexe_feuilles_lecture ON annexe_feuilles;
CREATE POLICY annexe_feuilles_lecture ON annexe_feuilles
  FOR SELECT TO authenticated USING (true);


-- ============================================================
-- LA LIASSE : toutes les feuilles d'une même impression.
--
-- Toutes les feuilles sorties d'une même impression portent le même numéro.
--
-- ⚠️ CE NUMÉRO N'ENGAGE RIEN. J'avais d'abord fait qu'un seul scan de l'économe
-- rende toute la cascade due, pour lui épargner des gestes. Layla a tranché :
-- « l'économe doit scanner feuille par feuille, sinon ça dit qu'il a donné
-- toute la matière ». Elle a raison — c'était écrire qu'il avait sorti des
-- matières premières qu'il n'avait pas sorties, et un registre qui ment sur la
-- marchandise ne vaut rien.
--
-- La liasse ne sert donc qu'à L'INFORMER : après avoir servi une demande, on
-- lui dit combien il en reste pour ce gâteau. On ne coche rien à sa place.
--
-- ⚠️ Il fallait une colonne : regrouper « par heure » se serait cassé dès deux
-- impressions rapprochées, et aurait mélangé la cascade du voisin.
--
-- Relançable sans risque.
-- ============================================================

ALTER TABLE annexe_feuilles
  ADD COLUMN IF NOT EXISTS liasse UUID;

COMMENT ON COLUMN annexe_feuilles.liasse IS
  'Toutes les feuilles sorties d''une même impression. Servir une seule demande engage la liasse entière.';

CREATE INDEX IF NOT EXISTS annexe_feuilles_liasse_idx ON annexe_feuilles (liasse);


-- ============================================================
-- QUI ATTEND L'ÉCONOME, ET QUI ATTEND SES SŒURS.
--
-- « J'ai pas donné la MP et c'est parti déjà dans déclarer. Ça ne doit partir
-- que si l'économe a scanné. Si les autres MP ne sont pas scannés, ça part
-- pas » (Layla, 2026-09-19).
--
-- Ma version d'avant rendait une feuille « sans rien à demander » due dès
-- l'impression. Faux : la TARTE ne demande rien elle-même — ses composants
-- sont la crème et le fond — mais on ne peut pas la monter tant que la crème
-- n'a même pas été servie. Elle réclamait un travail qui ne pouvait pas avoir
-- commencé.
--
-- La règle juste, et elle tient les deux phrases de Layla :
--   • une feuille QUI DEMANDE de la matière → due quand l'économe la scanne,
--     elle et pas une autre ;
--   • une feuille QUI NE DEMANDE RIEN → due quand plus aucune demande de sa
--     cascade n'attend. Si la cascade entière ne demande rien (tout est déjà
--     au frigo), elle est due tout de suite : c'est bien « pas de MP → direct
--     dans À déclarer ».
--
-- On garde donc la question posée à l'impression — cette feuille demandait-
-- elle quelque chose ? — au lieu de la deviner plus tard.
--
-- Relançable sans risque.
-- ============================================================

ALTER TABLE annexe_feuilles
  ADD COLUMN IF NOT EXISTS sans_economat BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN annexe_feuilles.sans_economat IS
  'true = cette feuille n''avait rien à demander à l''économat. Elle devient due quand plus aucune demande de sa liasse n''attend.';
