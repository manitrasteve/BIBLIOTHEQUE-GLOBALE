<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Jobs\NotifyCourseListAudienceJob;
use App\Models\Consultation;
use App\Models\CourseList;
use App\Models\CourseListItem;
use App\Models\Document;
use App\Models\ReadingProgress;
use App\Support\QueueKicker;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

/**
 * Bibliographies de cours.
 *  - Enseignant : crée une liste pour une de ses classes, y ajoute des documents (consigne, date limite),
 *    suit la lecture de la classe (chiffres anonymes) et envoie des rappels.
 *  - Étudiant : reçoit les listes de sa classe (établissement + niveau, parcours éventuel).
 */
class CourseListController extends Controller
{
    /** En dessous de ce nombre d'étudiants, le suivi n'affiche pas de chiffres (on reconnaîtrait les personnes). */
    public const MIN_AUDIENCE_FOR_STATS = 5;

    // ---------------------------------------------------------------- Enseignant

    public function index(Request $request)
    {
        $teacher = $request->user();
        $lists = CourseList::where('teacher_id', $teacher->id)->withCount('items')->latest()->get();

        return response()->json([
            'lists' => $lists->map(fn (CourseList $l) => [...$l->toArray(), 'audience_count' => $l->audience()->count()]),
            'classes' => $teacher->teacherClasses()->get(['school', 'level']),
        ]);
    }

    /** Nombre d'étudiants qu'atteindrait une liste (aperçu dans le formulaire). */
    public function audiencePreview(Request $request)
    {
        $data = $this->validateAudience($request);

        return response()->json(['count' => (new CourseList($data))->audience()->count()]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:2000'],
        ]) + $this->validateAudience($request);

        $list = CourseList::create([...$data, 'teacher_id' => $request->user()->id]);

        return response()->json($this->detail($list), 201);
    }

    public function show(Request $request, CourseList $courseList)
    {
        $this->authorizeOwner($request, $courseList);

        return response()->json($this->detail($courseList));
    }

    public function update(Request $request, CourseList $courseList)
    {
        $this->authorizeOwner($request, $courseList);
        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:2000'],
        ]) + $this->validateAudience($request);

        $courseList->update($data);

        return response()->json($this->detail($courseList));
    }

    public function destroy(Request $request, CourseList $courseList)
    {
        $this->authorizeOwner($request, $courseList);
        $courseList->delete();

        return response()->json(['message' => 'Bibliographie supprimée.']);
    }

    public function addItem(Request $request, CourseList $courseList)
    {
        $this->authorizeOwner($request, $courseList);
        $data = $request->validate([
            'slug' => ['required', 'string'],
            'instruction' => ['nullable', 'string', 'max:500'],
            'due_date' => ['nullable', 'date', 'after_or_equal:today'],
        ]);

        // Seuls les documents publiés du catalogue : les étudiants doivent pouvoir les ouvrir.
        $document = Document::where('status', 'publie')->where('slug', $data['slug'])->firstOrFail();
        abort_if($courseList->items()->where('document_id', $document->id)->exists(), 422, 'Ce document est déjà dans la bibliographie.');

        $courseList->items()->create([
            'document_id' => $document->id,
            'instruction' => $data['instruction'] ?? null,
            'due_date' => $data['due_date'] ?? null,
            'position' => (int) $courseList->items()->max('position') + 1,
        ]);

        QueueKicker::dispatch(new NotifyCourseListAudienceJob(
            $courseList,
            'Nouvelle lecture recommandée',
            "{$request->user()->name} a ajouté « {$document->title} » à « {$courseList->title} »."
                . (!empty($data['due_date']) ? ' À lire avant le ' . \Illuminate\Support\Carbon::parse($data['due_date'])->format('d/m/Y') . '.' : ''),
        ));

        return response()->json($this->detail($courseList), 201);
    }

    public function updateItem(Request $request, CourseList $courseList, CourseListItem $item)
    {
        $this->authorizeOwner($request, $courseList);
        abort_unless($item->course_list_id === $courseList->id, 404);

        $item->update($request->validate([
            'instruction' => ['nullable', 'string', 'max:500'],
            'due_date' => ['nullable', 'date'],
        ]));

        return response()->json($this->detail($courseList));
    }

    public function removeItem(Request $request, CourseList $courseList, CourseListItem $item)
    {
        $this->authorizeOwner($request, $courseList);
        abort_unless($item->course_list_id === $courseList->id, 404);
        $item->delete();

        return response()->json($this->detail($courseList));
    }

    /**
     * Suivi de lecture de la classe, document par document : lu en entier, commencé, jamais ouvert.
     * Chiffres agrégés uniquement (aucun nom), masqués sous MIN_AUDIENCE_FOR_STATS étudiants.
     */
    public function progress(Request $request, CourseList $courseList)
    {
        $this->authorizeOwner($request, $courseList);
        $studentIds = $courseList->audience()->pluck('id');
        $total = $studentIds->count();

        if ($total < self::MIN_AUDIENCE_FOR_STATS) {
            return response()->json(['audience_count' => $total, 'hidden' => true, 'items' => []]);
        }

        $items = $courseList->items()->with('document:id,title,slug')->get()->map(function (CourseListItem $item) use ($studentIds, $total) {
            [$done, $started] = $this->readingCounts($item->document_id, $studentIds->all());

            return [
                'item_id' => $item->id,
                'document' => $item->document,
                'due_date' => $item->due_date?->format('Y-m-d'),
                'done' => $done,
                'started' => $started,
                'never' => $total - $done - $started,
            ];
        });

        return response()->json(['audience_count' => $total, 'hidden' => false, 'items' => $items]);
    }

    /** Rappel aux étudiants de la classe qui n'ont jamais ouvert le document (l'enseignant ne voit pas leurs noms). */
    public function remind(Request $request, CourseList $courseList, CourseListItem $item)
    {
        $this->authorizeOwner($request, $courseList);
        abort_unless($item->course_list_id === $courseList->id, 404);

        $studentIds = $courseList->audience()->pluck('id')->all();
        $opened = $this->openedBy($item->document_id, $studentIds);
        $targets = array_values(array_diff($studentIds, $opened));

        if ($targets) {
            $title = $item->document?->title ?? 'un document';
            QueueKicker::dispatch(new NotifyCourseListAudienceJob(
                $courseList,
                'Rappel de lecture',
                "Pensez à lire « {$title} » pour « {$courseList->title} »."
                    . ($item->due_date ? ' À lire avant le ' . $item->due_date->format('d/m/Y') . '.' : ''),
                $targets,
            ));
        }

        return response()->json(['sent' => count($targets)]);
    }

    // ---------------------------------------------------------------- Étudiant

    /** Lectures recommandées : bibliographies de la classe de l'étudiant, avec l'état de sa propre lecture. */
    public function forStudent(Request $request)
    {
        $student = $request->user();
        if ($student->role !== 'etudiant' || !$student->school || !$student->niveau_detail) {
            return response()->json([]);
        }

        $lists = CourseList::forClassOf($student)
            ->with(['teacher:id,name', 'items.document:id,title,slug,type,cover_path,status'])
            ->latest()
            ->get()
            ->filter(fn (CourseList $l) => $l->targets($student))
            ->values();

        $documentIds = $lists->flatMap(fn ($l) => $l->items->pluck('document_id'))->unique()->all();
        $progress = ReadingProgress::where('user_id', $student->id)->whereIn('document_id', $documentIds)->get()->keyBy('document_id');
        $consulted = Consultation::where('user_id', $student->id)->whereIn('document_id', $documentIds)->pluck('document_id')->flip();

        return response()->json($lists->map(fn (CourseList $l) => [
            'id' => $l->id,
            'title' => $l->title,
            'description' => $l->description,
            'teacher' => $l->teacher?->name,
            'school' => $l->school,
            'level' => $l->level,
            'filiere' => $l->filiere,
            'items' => $l->items
                ->filter(fn ($i) => $i->document && $i->document->status === 'publie')
                ->map(fn (CourseListItem $i) => [
                    'id' => $i->id,
                    'instruction' => $i->instruction,
                    'due_date' => $i->due_date?->format('Y-m-d'),
                    'document' => [
                        'title' => $i->document->title,
                        'slug' => $i->document->slug,
                        'type' => $i->document->type,
                        'cover_url' => $i->document->cover_path ? Storage::url($i->document->cover_path) : null,
                    ],
                    'reading' => $this->studentStatus($progress->get($i->document_id), $consulted->has($i->document_id)),
                ])->values(),
        ]));
    }

    // ---------------------------------------------------------------- Outils

    private function authorizeOwner(Request $request, CourseList $courseList): void
    {
        abort_unless((int) $courseList->teacher_id === (int) $request->user()->id, 403, 'Cette bibliographie appartient à un autre enseignant.');
    }

    /** Classe visée : uniquement une classe attribuée à l'enseignant par le Service Numérique. */
    private function validateAudience(Request $request): array
    {
        $data = $request->validate([
            'school' => ['required', 'string'],
            'level' => ['required', 'string'],
            'filiere' => ['nullable', 'string', 'max:255'],
        ]);
        abort_unless(
            $request->user()->teachesClass($data['school'], $data['level']),
            422,
            'Cette classe ne vous est pas attribuée. Demandez au Service Numérique de l’ajouter à vos classes.',
        );
        $data['filiere'] = filled($data['filiere'] ?? null) ? trim($data['filiere']) : null;

        return $data;
    }

    private function detail(CourseList $list): array
    {
        $list->load(['items.document:id,title,slug,type,status']);

        return [...$list->toArray(), 'audience_count' => $list->audience()->count()];
    }

    /** [lus en entier, commencés] parmi les étudiants donnés ; « commencé » inclut une simple ouverture. */
    private function readingCounts(int $documentId, array $studentIds): array
    {
        $rows = ReadingProgress::where('document_id', $documentId)->whereIn('user_id', $studentIds)->get(['user_id', 'last_page', 'total_pages']);
        $done = $rows->filter(fn ($p) => $p->total_pages && $p->last_page >= $p->total_pages)->pluck('user_id');
        $opened = collect($this->openedBy($documentId, $studentIds));

        return [$done->count(), $opened->diff($done)->count()];
    }

    /** Étudiants (parmi ceux donnés) ayant ouvert le document : progression enregistrée ou consultation. */
    private function openedBy(int $documentId, array $studentIds): array
    {
        return ReadingProgress::where('document_id', $documentId)->whereIn('user_id', $studentIds)->pluck('user_id')
            ->merge(Consultation::where('document_id', $documentId)->whereIn('user_id', $studentIds)->pluck('user_id'))
            ->unique()->values()->all();
    }

    private function studentStatus(?ReadingProgress $progress, bool $consulted): string
    {
        if ($progress && $progress->total_pages && $progress->last_page >= $progress->total_pages) {
            return 'lu';
        }

        return ($progress || $consulted) ? 'commence' : 'a_lire';
    }
}
