# Instructions de Carpathi

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: *"Would a senior engineer say this is overcomplicated?"* If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

**The test:** Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.
# Instructions pour Claude Code

## Langue
Réponds toujours en français.

## Style de communication
- Parle simplement, sans jargon technique inutile.
- Layla n'est pas développeuse pro. Elle apprend.
- Quand tu poses une question, explique pourquoi tu la poses.
- Quand tu demandes une autorisation (Yes/No), explique en 1 phrase simple à quoi sert la commande.
- Évite les termes techniques sans les expliquer : si tu dois utiliser un mot comme "webhook", "policy RLS", "router", "endpoint", "handler", explique-le en parenthèses la première fois.
- Pas de blocs de code énormes sans contexte. Toujours dire avant : "Je vais faire X pour Y."

## Confirmations
Avant chaque modification de fichier important :
1. Dis en français ce que tu vas faire
2. Dis quel(s) fichier(s) vont être modifiés
3. Dis les risques éventuels
4. Demande confirmation simple : "Tu valides ?"

## Style de réponse
- Réponses courtes par défaut (3-5 phrases max)
- Listes à puces plutôt que paragraphes
- Émojis OK pour les sections (🎯 📋 ⚠️ ✅)
- Pas de "Of course!", "Certainly!", "Great idea!" en début de réponse

## Contexte projet
Le contexte complet est dans CONTEXT_WHATSAPP.md à la racine.
Lily Gourmet = app React + Vite + Supabase + Vercel pour une PME marocaine (traiteur).
Layla est l'admin / propriétaire de l'app.
