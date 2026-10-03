<?php

namespace App\Support;

use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * Règles communes aux formulaires de demande / création de compte (demande publique,
 * demande du Service Numérique, création directe par l'administrateur).
 */
final class AccountRequestRules
{
    public const SCHOOLS = [
        'IOSTM', 'IUGM', 'ISSTM', 'IUTAM', 'ILCSS',
        'Faculté de Médecine',
        "Faculté des sciences, technologies et de l'environnement (FSTE)",
        'Ecoles et formations rattachées',
    ];

    public const LEVELS = ['L1', 'L2', 'L3', 'M1', 'M2', 'Doctorat'];

    // Statuts d'une demande encore « en cours » (une seule par adresse e-mail).
    public const OPEN_STATUSES = ['en_attente', 'verifiee', 'en_attente_validation'];

    public const CIN_MESSAGES = [
        'cin_number.required' => 'Le n° de CIN est obligatoire à partir de 18 ans.',
        'cin_issued_at.required' => 'La date de délivrance de la CIN est obligatoire à partir de 18 ans.',
        'date_of_birth.before' => 'La date de naissance doit être antérieure à la date du jour.',
    ];

    /** Majeur : 18 ans révolus aujourd'hui. La CIN n'est demandée à un étudiant qu'à partir de cet âge. */
    public static function isAdult(mixed $dateOfBirth): bool
    {
        if (! is_string($dateOfBirth) || $dateOfBirth === '') {
            return false;
        }

        try {
            return Carbon::parse($dateOfBirth)->addYears(18)->lte(today());
        } catch (\Throwable) {
            return false;
        }
    }

    // CIN d'un étudiant : obligatoire s'il est majeur, sinon facultative (et ignorée, voir withoutMinorCin).
    public static function studentCinRules(Request $request, bool $isStudent = true): array
    {
        $required = $isStudent && self::isAdult($request->input('date_of_birth'));

        return [
            'cin_number' => [Rule::requiredIf($required), 'nullable', 'digits:12'],
            'cin_issued_at' => [Rule::requiredIf($required), 'nullable', 'date', 'before_or_equal:today'],
        ];
    }

    // Étudiant mineur : aucune CIN n'est enregistrée, même si elle a été envoyée.
    public static function withoutMinorCin(array $validated): array
    {
        if (! self::isAdult($validated['date_of_birth'] ?? null)) {
            $validated['cin_number'] = null;
            $validated['cin_issued_at'] = null;
        }

        return $validated;
    }

    // Niveau d'études : toujours « Université » pour un étudiant, sans objet pour les autres rôles.
    public static function normalizeLevel(array $validated): array
    {
        if (($validated['role'] ?? null) === 'etudiant') {
            $validated['niveau_type'] = 'Université';
        } else {
            $validated['school'] = null;
            $validated['filiere'] = null;
            $validated['niveau_type'] = null;
            $validated['niveau_detail'] = null;
        }

        return $validated;
    }

    // Code du rôle dans le numéro de demande quand aucun établissement n'est renseigné (enseignant, chercheur…).
    private const ROLE_CODES = ['etudiant' => 'ETU', 'enseignant' => 'ENS', 'chercheur' => 'CHR'];

    /**
     * Numéro de demande : REQ-<compteur sur 4 chiffres>-<établissement abrégé>-<année>, ex. REQ-0007-FSTE-2026.
     * Le compteur repart de 1 chaque année. `$data` : champs de la demande (school, faculty, role).
     */
    public static function newRequestNumber(array $data = []): string
    {
        $year = now()->year;
        $code = self::establishmentCode($data['school'] ?? null)
            ?? self::establishmentCode($data['faculty'] ?? null)
            ?? (self::ROLE_CODES[$data['role'] ?? ''] ?? 'GEN');

        // Plus grand compteur de l'année (numéros au nouveau format), même après suppression de demandes.
        $counter = \App\Models\AccountRequest::where('request_number', 'like', "REQ-%-{$year}")
            ->pluck('request_number')
            ->map(fn (string $number) => (int) (explode('-', $number)[1] ?? 0))
            ->max() ?? 0;

        do {
            $counter++;
            $number = sprintf('REQ-%04d-%s-%d', $counter, $code, $year);
        } while (\App\Models\AccountRequest::where('request_number', $number)->exists());

        return $number;
    }

    /**
     * Abréviation d'un établissement : sigle entre parenthèses s'il y en a un (« … (FSTE) » → FSTE), nom court
     * tel quel (« IOSTM »), sinon initiales des mots importants (« Faculté de Médecine » → FM).
     */
    public static function establishmentCode(?string $name): ?string
    {
        $name = trim((string) $name);
        if ($name === '') {
            return null;
        }

        if (preg_match('/\(([^)]+)\)/', $name, $match)) {
            return strtoupper(preg_replace('/[^A-Za-z0-9]/', '', Str::ascii($match[1])));
        }

        $ascii = Str::ascii($name);
        if (!str_contains($ascii, ' ') && strlen($ascii) <= 8) {
            return strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $ascii));
        }

        $minor = ['de', 'des', 'du', 'et', 'la', 'le', 'les', 'l', 'd', 'en', 'a', 'au', 'aux'];
        $initials = collect(preg_split("/[\s'’\-]+/", $ascii))
            ->filter(fn ($word) => $word !== '' && !in_array(strtolower($word), $minor, true))
            ->map(fn ($word) => strtoupper($word[0]))
            ->join('');

        return $initials !== '' ? substr($initials, 0, 8) : null;
    }
}
