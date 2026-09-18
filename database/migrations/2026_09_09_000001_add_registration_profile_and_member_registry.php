<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (!Schema::hasColumn('users', 'matricule')) $table->string('matricule', 40)->nullable()->unique()->after('email');
            if (!Schema::hasColumn('users', 'school')) $table->string('school')->nullable()->after('address');
            if (!Schema::hasColumn('users', 'filiere')) $table->string('filiere')->nullable()->after('school');
            if (!Schema::hasColumn('users', 'niveau_type')) $table->string('niveau_type', 30)->nullable()->after('filiere');
            if (!Schema::hasColumn('users', 'niveau_detail')) $table->string('niveau_detail', 50)->nullable()->after('niveau_type');
            if (!Schema::hasColumn('users', 'specialty')) $table->string('specialty')->nullable()->after('niveau_detail');
            if (!Schema::hasColumn('users', 'diploma')) $table->string('diploma')->nullable()->after('specialty');
            if (!Schema::hasColumn('users', 'workplace')) $table->string('workplace')->nullable()->after('diploma');
            if (!Schema::hasColumn('users', 'researcher_field')) $table->string('researcher_field')->nullable()->after('workplace');
            if (!Schema::hasColumn('users', 'profession')) $table->string('profession')->nullable()->after('researcher_field');
            if (!Schema::hasColumn('users', 'experience')) $table->text('experience')->nullable()->after('profession');
        });

        Schema::table('account_requests', function (Blueprint $table) {
            foreach ([
                'matricule' => ['string', 40],
                'school' => ['string', null],
                'filiere' => ['string', null],
                'niveau_type' => ['string', 30],
                'niveau_detail' => ['string', 50],
                'specialty' => ['string', null],
                'diploma' => ['string', null],
                'workplace' => ['string', null],
                'researcher_field' => ['string', null],
                'profession' => ['string', null],
                'experience' => ['text', null],
                 ] as $column => [$type, $length]) {
                if (!Schema::hasColumn('account_requests', $column)) {
                    if ($type === 'text') $table->text($column)->nullable();
                    elseif ($length) $table->string($column, $length)->nullable();
                    else $table->string($column)->nullable();
                }
            }
        });

        if (!Schema::hasTable('member_registries')) {
            Schema::create('member_registries', function (Blueprint $table) {
                $table->id();
                $table->string('matricule', 40)->unique();
                $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
                $table->string('role', 40);
                $table->string('last_name');
                $table->string('first_name');
                $table->string('email')->nullable();
                $table->string('phone', 50)->nullable();
                $table->string('address')->nullable();
                $table->string('gender', 20)->nullable();
                $table->string('status', 30)->default('actif');
                $table->json('profile_data')->nullable();
                $table->timestamps();
                $table->index(['role', 'status']);
            });
        }

        // Les comptes déjà présents reçoivent un matricule et une fiche historique.
        DB::table('users')->orderBy('id')->get()->each(function ($user) {
            $existing = DB::table('member_registries')->where('user_id', $user->id)->first();
            if ($existing) return;

            $matricule = $user->matricule ?: 'BM-' . now()->format('Y') . '-' . str_pad((string) $user->id, 6, '0', STR_PAD_LEFT);
            while (DB::table('member_registries')->where('matricule', $matricule)->exists()) {
                $matricule = 'BM-' . now()->format('Y') . '-' . str_pad((string) ($user->id + random_int(1, 999)), 6, '0', STR_PAD_LEFT);
            }

            DB::table('users')->where('id', $user->id)->update(['matricule' => $matricule]);
            DB::table('member_registries')->insert([
                'matricule' => $matricule,
                'user_id' => $user->id,
                'role' => $user->role ?: 'etudiant',
                'last_name' => trim(implode(' ', array_slice(preg_split('/\s+/', trim((string) ($user->name ?: 'Utilisateur'))) ?: ['Utilisateur'], 1))),
                'first_name' => trim((preg_split('/\s+/', trim((string) ($user->name ?: 'Utilisateur'))) ?: ['Utilisateur'])[0]),
                'email' => $user->email,
                'phone' => $user->phone ?? null,
                'address' => $user->address ?? null,
                'gender' => $user->gender ?? null,
                'status' => $user->is_active ? 'actif' : 'desactive',
                'profile_data' => json_encode([], JSON_UNESCAPED_UNICODE),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('member_registries');
        Schema::table('account_requests', function (Blueprint $table) {
            foreach (['matricule','school','filiere','niveau_type','niveau_detail','specialty','diploma','workplace','researcher_field','profession','experience'] as $column) {
                if (Schema::hasColumn('account_requests', $column)) $table->dropColumn($column);
            }
        });
        Schema::table('users', function (Blueprint $table) {
            foreach (['matricule','school','filiere','niveau_type','niveau_detail','specialty','diploma','workplace','researcher_field','profession','experience'] as $column) {
                if (Schema::hasColumn('users', $column)) $table->dropColumn($column);
            }
        });
    }
};