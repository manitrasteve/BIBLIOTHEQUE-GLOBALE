<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Jobs\IngestDocumentJob;
use App\Models\Category;
use App\Models\CourseList;
use App\Models\Document;
use App\Models\User;
use App\Services\ActivityLogService;
use App\Services\NotificationService;
use App\Support\QueueKicker;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

/**
 * Dépôt de supports de cours par un enseignant (polycopié, TD, annales…).
 * Le document arrive au statut « soumis » ; le Service Numérique le complète puis le publie (ou programme
 * sa publication), ou le refuse avec un motif. L'enseignant peut alors renvoyer un PDF corrigé.
 */
class TeacherSubmissionController extends Controller
{
    /** Mes dépôts, du plus récent au plus ancien. */
    public function index(Request $request)
    {
        $documents = Document::where('created_by', $request->user()->id)
            ->with('category:id,name')
            ->withCount('consultations')
            ->latest()
            ->get(['id', 'slug', 'title', 'type', 'status', 'review_note', 'published_at', 'scheduled_at', 'category_id', 'submission_course_list_id', 'created_at', 'updated_at']);

        return response()->json($documents);
    }

    public function store(Request $request)
    {
        $teacher = $request->user();
        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'type' => ['required', 'string', 'max:100'],
            'abstract' => ['nullable', 'string', 'max:5000'],
            'category' => ['required', 'string', 'max:255', 'regex:/[\pL\pN]/u'],
            'library_id' => ['required', 'exists:libraries,id'],
            'niveau' => ['nullable', 'string', 'max:100'],
            'language' => ['nullable', 'string', 'max:50'],
            'course_list_id' => ['nullable', 'integer'],
            'file' => ['required', 'file', 'mimes:pdf', 'max:51200'],
        ]);

        $courseListId = null;
        if (!empty($data['course_list_id'])) {
            $courseListId = CourseList::where('teacher_id', $teacher->id)->findOrFail($data['course_list_id'])->id;
        }

        $document = Document::create([
            'title' => $data['title'],
            'type' => $data['type'],
            'abstract' => $data['abstract'] ?? null,
            'niveau' => $data['niveau'] ?? null,
            'language' => $data['language'] ?? 'fr',
            'category_id' => Category::resolveId($data['category']),
            'library_id' => $data['library_id'],
            'access_level' => 'authentifie',
            'status' => 'soumis',
            'file_path' => $request->file('file')->store('documents', 'local'),
            'created_by' => $teacher->id,
            'submission_course_list_id' => $courseListId,
        ]);

        ActivityLogService::log($teacher->id, 'depot_document', $document->title, $document);
        $this->notifyStaff($teacher, $document, 'Nouveau dépôt d’un enseignant', "{$teacher->name} a déposé « {$document->title} ». Vérifiez-le puis publiez-le ou refusez-le.");
        QueueKicker::dispatch(new IngestDocumentJob($document));

        return response()->json($document, 201);
    }

    /** Dépôt refusé : l'enseignant envoie un PDF corrigé, le document repart en vérification. */
    public function resubmit(Request $request, Document $document)
    {
        $teacher = $request->user();
        abort_unless((int) $document->created_by === (int) $teacher->id, 403);
        abort_unless($document->status === 'refuse', 422, 'Seul un dépôt refusé peut être renvoyé.');

        $request->validate(['file' => ['required', 'file', 'mimes:pdf', 'max:51200']]);
        $previous = $document->file_path;
        $document->update([
            'file_path' => $request->file('file')->store('documents', 'local'),
            'status' => 'soumis',
            'review_note' => null,
        ]);
        if ($previous) {
            Storage::disk('local')->delete($previous);
        }

        ActivityLogService::log($teacher->id, 'depot_document', $document->title, $document, ['status' => ['before' => 'refuse', 'after' => 'soumis']]);
        $this->notifyStaff($teacher, $document, 'Dépôt corrigé', "{$teacher->name} a renvoyé « {$document->title} » après correction.");
        QueueKicker::dispatch(new IngestDocumentJob($document->fresh()));

        return response()->json($document->fresh());
    }

    /** Service Numérique : refus d'un dépôt, avec un motif envoyé à l'enseignant. */
    public function reject(Request $request, Document $document)
    {
        abort_unless($document->status === 'soumis', 422, 'Seul un dépôt en attente de vérification peut être refusé.');
        $data = $request->validate(['reason' => ['required', 'string', 'max:1000']]);

        $document->update(['status' => 'refuse', 'review_note' => $data['reason']]);

        ActivityLogService::log($request->user()->id, 'refus_depot_document', $document->title, $document, [
            'status' => ['before' => 'soumis', 'after' => 'refuse'],
        ]);
        if ($teacher = User::find($document->created_by)) {
            NotificationService::send($teacher, 'depot_refuse', 'Dépôt à corriger', "« {$document->title} » : {$data['reason']}", $document);
        }

        return response()->json($document);
    }

    private function notifyStaff(User $teacher, Document $document, string $title, string $message): void
    {
        User::whereIn('role', ['administrateur', 'bibliothecaire'])->where('is_active', true)
            ->each(fn (User $staff) => NotificationService::send($staff, 'document_ajoute', $title, $message, $document));
    }
}
