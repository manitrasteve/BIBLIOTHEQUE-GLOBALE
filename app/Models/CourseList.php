<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

/**
 * Bibliographie de cours d'un enseignant, adressée à une classe : établissement + niveau,
 * et facultativement un parcours. Les étudiants dont le profil correspond la reçoivent automatiquement.
 */
class CourseList extends Model
{
    protected $fillable = ['teacher_id', 'title', 'description', 'school', 'level', 'filiere'];

    public function teacher(): BelongsTo
    {
        return $this->belongsTo(User::class, 'teacher_id');
    }

    public function items(): HasMany
    {
        return $this->hasMany(CourseListItem::class)->orderBy('position')->orderBy('id');
    }

    /** Parcours comparé sans tenir compte des majuscules, des accents ni des espaces superflus (saisie libre). */
    public static function normalizeFiliere(?string $value): string
    {
        return Str::of(Str::ascii((string) $value))->lower()->squish()->toString();
    }

    /** Étudiants actifs de la classe visée (filtrage du parcours en PHP : il est saisi librement). */
    public function audience(): Collection
    {
        $students = User::query()
            ->where('role', 'etudiant')
            ->where('is_active', true)
            ->where('school', $this->school)
            ->where('niveau_detail', $this->level)
            ->get(['id', 'filiere']);

        if (!filled($this->filiere)) {
            return $students;
        }

        $wanted = self::normalizeFiliere($this->filiere);

        return $students->filter(fn (User $u) => self::normalizeFiliere($u->filiere) === $wanted)->values();
    }

    /** Bibliographies de la classe d'un étudiant (le parcours est ensuite vérifié par targets()). */
    public function scopeForClassOf(Builder $query, User $student): Builder
    {
        return $query->where('school', $student->school)->where('level', $student->niveau_detail);
    }

    public function targets(User $student): bool
    {
        return $student->role === 'etudiant'
            && $student->school === $this->school
            && $student->niveau_detail === $this->level
            && (!filled($this->filiere) || self::normalizeFiliere($student->filiere) === self::normalizeFiliere($this->filiere));
    }
}
