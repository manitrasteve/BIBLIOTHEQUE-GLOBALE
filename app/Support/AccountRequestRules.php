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

    public static function newRequestNumber(): string
    {
        return 'REQ-'.now()->format('YmdHis').'-'.strtoupper(Str::random(5));
    }
}
