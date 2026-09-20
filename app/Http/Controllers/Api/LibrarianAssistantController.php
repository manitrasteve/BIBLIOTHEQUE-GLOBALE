<?php

namespace App\Http\Controllers\Api;

// Assistant IA de gestion — BIBLIOTHÉCAIRE uniquement (route protégée par role:bibliothecaire).
// Même mécanique que l'administrateur, mais le périmètre (sa seule bibliothèque) est imposé par
// AssistantScope à partir du compte authentifié : ni la requête ni Gemini ne peuvent l'élargir.
class LibrarianAssistantController extends AdminAssistantController
{
}
