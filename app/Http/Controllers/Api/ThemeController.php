<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ThemeVersion;
use App\Services\ActivityLogService;
use App\Support\ThemePalette;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * Paramètres → Apparence du site : couleurs du thème (mode clair et mode sombre),
 * brouillon → aperçu → publication, comme la page d'accueil. Routes réservées à l'administrateur.
 * Le thème publié est injecté dans chaque page par resources/views/app.blade.php (activeCss).
 */
class ThemeController extends Controller
{
    private const CACHE_KEY = 'site_theme_css';

    /** CSS du thème actif (vide = couleurs d'origine), mis en cache jusqu'à la prochaine publication. */
    public static function activeCss(): string
    {
        try {
            return Cache::rememberForever(self::CACHE_KEY, function () {
                $current = ThemeVersion::current();

                return $current ? ThemePalette::css($current->colors) : '';
            });
        } catch (Throwable) {
            return ''; // base indisponible ou table absente : le site garde ses couleurs d'origine
        }
    }

    public function show()
    {
        $draft = ThemeVersion::draft()?->load('author:id,name');
        $current = ThemeVersion::current()?->load('author:id,name');

        return response()->json([
            'defaults' => ThemePalette::defaults(),
            'draft' => $draft ? [
                'colors' => $draft->colors,
                'updated_at' => $draft->updated_at,
                'author' => $draft->author?->name,
            ] : null,
            'published' => $current ? $this->summary($current) + ['colors' => $current->colors] : null,
        ]);
    }

    /** CSS d'aperçu pour des couleurs non enregistrées (aucune écriture). */
    public function preview(Request $request)
    {
        $colors = ThemePalette::validate($request->input('colors'));

        return response()->json(['css' => ThemePalette::css($colors)]);
    }

    public function saveDraft(Request $request)
    {
        $colors = ThemePalette::validate($request->input('colors'));

        $draft = ThemeVersion::updateOrCreate(
            ['status' => ThemeVersion::DRAFT],
            ['colors' => $colors, 'created_by' => $request->user()->id],
        );

        return response()->json([
            'message' => 'Brouillon enregistré. Il n’est pas encore visible par les visiteurs.',
            'draft' => ['colors' => $colors, 'updated_at' => $draft->updated_at, 'author' => $request->user()->name],
        ]);
    }

    public function discardDraft()
    {
        ThemeVersion::where('status', ThemeVersion::DRAFT)->delete();

        return response()->json(['message' => 'Brouillon supprimé.']);
    }

    /** Publie le brouillon enregistré : il devient le thème actif de tout le site. */
    public function publish(Request $request)
    {
        $draft = ThemeVersion::draft();
        if (! $draft) {
            return response()->json(['message' => 'Aucun brouillon à publier. Enregistrez d’abord vos modifications.'], 422);
        }

        $colors = ThemePalette::validate($draft->colors);
        $version = $this->createVersion($request, $colors);
        $draft->delete();

        ActivityLogService::log($request->user()->id, 'publication_theme', "Apparence du site — version {$version->version}");

        return response()->json([
            'message' => "Thème publié (version {$version->version}).",
            'published' => $this->summary($version->load('author:id,name')) + ['colors' => $colors],
        ]);
    }

    /**
     * Restauration des couleurs d'origine : crée une NOUVELLE version publiée avec la palette par
     * défaut. L'historique est conservé ; le brouillon en cours est abandonné.
     */
    public function restoreDefault(Request $request)
    {
        $version = $this->createVersion($request, ThemePalette::defaults(), true);
        ThemeVersion::where('status', ThemeVersion::DRAFT)->delete();

        ActivityLogService::log($request->user()->id, 'restauration_theme', "Apparence du site — thème par défaut restauré (version {$version->version})");

        return response()->json([
            'message' => "Thème par défaut restauré (version {$version->version}).",
            'published' => $this->summary($version->load('author:id,name')) + ['colors' => ThemePalette::defaults()],
        ]);
    }

    public function versions()
    {
        $versions = ThemeVersion::published()->with('author:id,name')->orderByDesc('version')->limit(20)->get();

        return response()->json($versions->map(fn ($v) => $this->summary($v)));
    }

    private function createVersion(Request $request, array $colors, bool $isDefault = false): ThemeVersion
    {
        $version = DB::transaction(function () use ($request, $colors, $isDefault) {
            // Verrou : deux publications simultanées ne peuvent pas obtenir le même numéro.
            $next = (int) ThemeVersion::published()->lockForUpdate()->max('version') + 1;

            return ThemeVersion::create([
                'status' => ThemeVersion::PUBLISHED,
                'version' => $next,
                'colors' => $colors,
                'is_default' => $isDefault || ThemePalette::isDefault($colors),
                'created_by' => $request->user()->id,
                'published_at' => now(),
            ]);
        });

        Cache::forget(self::CACHE_KEY);

        return $version;
    }

    private function summary(ThemeVersion $version): array
    {
        return [
            'version' => $version->version,
            'published_at' => $version->published_at,
            'author' => $version->author?->name,
            'is_default' => $version->is_default,
        ];
    }
}
