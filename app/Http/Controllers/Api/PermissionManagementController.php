<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Permission;
use App\Models\User;
use App\Services\ActivityLogService;
use App\Services\NotificationService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class PermissionManagementController extends Controller
{
    public function librarians()
    {
        return User::query()
            ->where('role', 'bibliothecaire')
            ->with('library:id,name')
            ->withCount('permissions')
            ->orderBy('name')
            ->get();
    }

    public function permissions()
    {
        return Permission::query()->orderBy('category')->orderBy('label')->get(['id', 'name', 'category', 'label', 'description']);
    }

    public function show(User $librarian)
    {
        $this->ensureLibrarian($librarian);

        return response()->json([
            'permissions' => $librarian->permissions()->pluck('name')->values(),
        ]);
    }

    public function update(Request $request, User $librarian)
    {
        $this->ensureLibrarian($librarian);

        $data = $request->validate([
            'permissions' => ['present', 'array'],
            'permissions.*' => ['string', Rule::exists('permissions', 'name')],
        ]);

        $target = Permission::whereIn('name', array_unique($data['permissions']))->get(['id', 'name', 'label']);
        $current = $librarian->permissions()->get(['permissions.id', 'name', 'label']);
        $currentIds = $current->pluck('id');
        $targetIds = $target->pluck('id');
        $added = $target->whereNotIn('id', $currentIds);
        $removed = $current->whereNotIn('id', $targetIds);

        if ($added->isNotEmpty() || $removed->isNotEmpty()) {
            DB::transaction(function () use ($librarian, $added, $removed, $request): void {
                if ($added->isNotEmpty()) {
                    $librarian->permissions()->attach($added->pluck('id'));
                }
                if ($removed->isNotEmpty()) {
                    $librarian->permissions()->detach($removed->pluck('id'));
                }

                $message = $this->changeMessage($added->pluck('label')->all(), $removed->pluck('label')->all());
                NotificationService::send($librarian, 'permissions_mises_a_jour', 'Vos permissions ont été mises à jour', $message);
                ActivityLogService::log($request->user()->id, 'permissions_modifiees', "{$request->user()->name} a modifié les permissions de {$librarian->name}. {$message}", $librarian);
            });
        }

        return response()->json([
            'message' => $added->isEmpty() && $removed->isEmpty() ? 'Aucune modification à enregistrer.' : 'Permissions enregistrées.',
            'permissions' => $librarian->fresh()->permissions()->pluck('name')->values(),
            'added' => $added->pluck('name')->values(),
            'removed' => $removed->pluck('name')->values(),
        ]);
    }

    private function ensureLibrarian(User $user): void
    {
        abort_unless($user->role === 'bibliothecaire', 422, 'Cet utilisateur n\'est pas un bibliothécaire.');
    }

    private function changeMessage(array $added, array $removed): string
    {
        $parts = [];
        if ($added) $parts[] = count($added).' permission(s) ajoutée(s) : '.implode(', ', $added).'.';
        if ($removed) $parts[] = count($removed).' permission(s) retirée(s) : '.implode(', ', $removed).'.';

        return implode(' ', $parts);
    }
}
