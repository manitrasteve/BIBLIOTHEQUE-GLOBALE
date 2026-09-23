<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\HomepageVersion;
use App\Services\ActivityLogService;
use App\Support\HomepageSchema;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/**
 * Page d'accueil configurable : brouillon → aperçu → publication, avec historique des versions.
 * Seule la route publique est hors du groupe « role:administrateur ».
 */
class HomepageController extends Controller
{
    // Délai avant de supprimer une image téléversée mais jamais enregistrée dans un brouillon.
    private const ORPHAN_GRACE_HOURS = 24;

    /**
     * Configuration publique : uniquement la dernière version publiée, jamais le brouillon.
     * sections = null → le frontend affiche la page d'accueil par défaut.
     */
    public function published()
    {
        $current = HomepageVersion::current();

        return response()->json([
            'version' => $current?->version,
            'published_at' => $current?->published_at,
            'sections' => $current?->sections(),
        ]);
    }

    public function show()
    {
        $draft = HomepageVersion::draft()?->load('author:id,name');
        $current = HomepageVersion::current()?->load('author:id,name');

        return response()->json([
            'draft' => $draft ? [
                'sections' => $draft->sections(),
                'updated_at' => $draft->updated_at,
                'author' => $draft->author?->name,
            ] : null,
            'published' => $current ? $this->summary($current) + ['sections' => $current->sections()] : null,
        ]);
    }

    public function saveDraft(Request $request)
    {
        $sections = HomepageSchema::validate($request->input('sections'));

        $draft = HomepageVersion::updateOrCreate(
            ['status' => HomepageVersion::DRAFT],
            ['content' => ['sections' => $sections], 'created_by' => $request->user()->id],
        );

        $this->deleteOrphanImages();

        return response()->json([
            'message' => 'Brouillon enregistré.',
            'draft' => ['sections' => $sections, 'updated_at' => $draft->updated_at, 'author' => $request->user()->name],
        ]);
    }

    public function discardDraft()
    {
        HomepageVersion::where('status', HomepageVersion::DRAFT)->delete();
        $this->deleteOrphanImages();

        return response()->json(['message' => 'Brouillon supprimé.']);
    }

    /** Publie le brouillon enregistré : nouvelle version active sur la page publique. */
    public function publish(Request $request)
    {
        $draft = HomepageVersion::draft();

        if (!$draft) {
            return response()->json(['message' => 'Aucun brouillon à publier. Enregistrez d’abord vos modifications.'], 422);
        }

        // Revalidation : une image a pu disparaître depuis l'enregistrement du brouillon.
        $sections = HomepageSchema::validate($draft->sections());
        $version = $this->createVersion($request, $sections);
        $draft->delete();

        ActivityLogService::log($request->user()->id, 'publication_page_accueil', "Page d'accueil — version {$version->version}");

        return response()->json([
            'message' => "Version {$version->version} publiée.",
            'published' => $this->summary($version->load('author:id,name')) + ['sections' => $sections],
        ]);
    }

    public function versions()
    {
        $versions = HomepageVersion::published()
            ->with('author:id,name')
            ->orderByDesc('version')
            ->paginate(20);

        return response()->json([
            'data' => $versions->getCollection()->map(fn ($v) => $this->summary($v) + [
                'section_count' => count($v->sections()),
            ]),
            'current_page' => $versions->currentPage(),
            'last_page' => $versions->lastPage(),
            'total' => $versions->total(),
        ]);
    }

    public function version(int $version)
    {
        $found = HomepageVersion::published()->with('author:id,name')->where('version', $version)->firstOrFail();

        return response()->json($this->summary($found) + ['sections' => $found->sections()]);
    }

    /**
     * Restauration : crée une NOUVELLE version publiée identique à l'ancienne.
     * L'historique n'est jamais modifié ; le brouillon en cours est abandonné.
     */
    public function restore(Request $request, int $version)
    {
        $source = HomepageVersion::published()->where('version', $version)->firstOrFail();
        $sections = HomepageSchema::validate($source->sections());

        $restored = $this->createVersion($request, $sections, $source->version);
        HomepageVersion::where('status', HomepageVersion::DRAFT)->delete();
        $this->deleteOrphanImages();

        ActivityLogService::log(
            $request->user()->id,
            'restauration_page_accueil',
            "Page d'accueil — version {$source->version} restaurée en version {$restored->version}",
        );

        return response()->json([
            'message' => "Version {$source->version} restaurée (nouvelle version {$restored->version}).",
            'published' => $this->summary($restored->load('author:id,name')) + ['sections' => $sections],
        ]);
    }

    /** Téléversement d'une image : même disque et mêmes règles que les photos de bibliothèque. */
    public function uploadImage(Request $request)
    {
        $request->validate([
            'image' => ['required', 'image', 'mimes:jpg,jpeg,png,webp', 'max:4096'],
        ]);

        $path = $request->file('image')->store(HomepageSchema::IMAGE_DIR, 'public');

        return response()->json(['path' => $path, 'url' => Storage::disk('public')->url($path)], 201);
    }

    private function createVersion(Request $request, array $sections, ?int $restoredFrom = null): HomepageVersion
    {
        // Verrou : deux publications simultanées ne peuvent pas obtenir le même numéro.
        return DB::transaction(function () use ($request, $sections, $restoredFrom) {
            $next = (int) HomepageVersion::published()->lockForUpdate()->max('version') + 1;

            return HomepageVersion::create([
                'status' => HomepageVersion::PUBLISHED,
                'version' => $next,
                'content' => ['sections' => $sections],
                'created_by' => $request->user()->id,
                'restored_from' => $restoredFrom,
                'published_at' => now(),
            ]);
        });
    }

    private function summary(HomepageVersion $version): array
    {
        return [
            'version' => $version->version,
            'published_at' => $version->published_at,
            'author' => $version->author?->name,
            'restored_from' => $version->restored_from,
        ];
    }

    /**
     * Supprime les images du dossier homepage qui ne sont utilisées ni par le brouillon ni par
     * aucune version publiée (une image remplacée reste tant qu'une ancienne version l'utilise,
     * pour que la restauration fonctionne). Les téléversements récents sont épargnés : ils
     * appartiennent peut-être à une modification pas encore enregistrée.
     */
    private function deleteOrphanImages(): void
    {
        $used = HomepageVersion::all()
            ->flatMap(fn ($v) => HomepageSchema::imagesIn($v->sections()))
            ->flip();

        $disk = Storage::disk('public');
        $limit = now()->subHours(self::ORPHAN_GRACE_HOURS)->getTimestamp();

        foreach ($disk->files(HomepageSchema::IMAGE_DIR) as $file) {
            if (!$used->has($file) && $disk->lastModified($file) < $limit) {
                $disk->delete($file);
            }
        }
    }
}
