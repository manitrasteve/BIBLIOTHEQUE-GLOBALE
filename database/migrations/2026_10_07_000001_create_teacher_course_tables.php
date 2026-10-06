<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Espace enseignant :
 *  - teacher_classes : classes (établissement + niveau) attribuées à un enseignant par le Service Numérique ;
 *  - course_lists / course_list_items : bibliographies de cours, adressées à une classe (parcours facultatif) ;
 *  - documents.review_note / submission_course_list_id : dépôt d'un support de cours par un enseignant
 *    (statut « soumis », puis publié ou « refuse » avec motif).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('teacher_classes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('school');
            $table->string('level', 20);
            $table->timestamps();
            $table->unique(['user_id', 'school', 'level']);
        });

        Schema::create('course_lists', function (Blueprint $table) {
            $table->id();
            $table->foreignId('teacher_id')->constrained('users')->cascadeOnDelete();
            $table->string('title');
            $table->text('description')->nullable();
            $table->string('school');
            $table->string('level', 20);
            $table->string('filiere')->nullable();
            $table->timestamps();
            $table->index(['school', 'level']);
        });

        Schema::create('course_list_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('course_list_id')->constrained()->cascadeOnDelete();
            $table->foreignId('document_id')->constrained()->cascadeOnDelete();
            $table->string('instruction', 500)->nullable();
            $table->date('due_date')->nullable();
            $table->unsignedInteger('position')->default(0);
            $table->timestamps();
            $table->unique(['course_list_id', 'document_id']);
        });

        Schema::table('documents', function (Blueprint $table) {
            $table->text('review_note')->nullable()->after('scheduled_by');
            $table->foreignId('submission_course_list_id')->nullable()->after('review_note')
                ->constrained('course_lists')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('documents', function (Blueprint $table) {
            $table->dropConstrainedForeignId('submission_course_list_id');
            $table->dropColumn('review_note');
        });
        Schema::dropIfExists('course_list_items');
        Schema::dropIfExists('course_lists');
        Schema::dropIfExists('teacher_classes');
    }
};
