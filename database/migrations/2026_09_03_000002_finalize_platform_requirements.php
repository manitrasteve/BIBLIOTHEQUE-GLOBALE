<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (Schema::hasColumn('users', 'phone') === false) $table->string('phone', 50)->nullable()->after('address');
            if (Schema::hasColumn('users', 'gender') === false) $table->string('gender', 20)->nullable()->after('phone');
        });

        Schema::table('account_requests', function (Blueprint $table) {
            if (Schema::hasColumn('account_requests', 'setup_token_hash') === false) $table->string('setup_token_hash')->nullable()->index();
            if (Schema::hasColumn('account_requests', 'setup_expires_at') === false) $table->timestamp('setup_expires_at')->nullable();
            if (Schema::hasColumn('account_requests', 'rejection_reason') === false) $table->text('rejection_reason')->nullable();
            if (Schema::hasColumn('account_requests', 'validation_deadline_at') === false) $table->timestamp('validation_deadline_at')->nullable();
        });

        if (!Schema::hasTable('favorites')) {
            Schema::create('favorites', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
                $table->foreignId('document_id')->constrained('documents')->cascadeOnDelete();
                $table->timestamps();
                $table->unique(['user_id', 'document_id']);
            });
        }

        if (!Schema::hasTable('feedbacks')) {
            Schema::create('feedbacks', function (Blueprint $table) {
                $table->id();
                $table->uuid('uuid')->unique();
                $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
                $table->string('type');
                $table->string('subject');
                $table->text('message');
                $table->unsignedTinyInteger('rating')->nullable();
                $table->string('status')->default('nouveau');
                $table->text('admin_reply')->nullable();
                $table->timestamp('replied_at')->nullable();
                $table->timestamps();
            });
        }

        if (!Schema::hasTable('problem_reports')) {
            Schema::create('problem_reports', function (Blueprint $table) {
                $table->id();
                $table->uuid('uuid')->unique();
                $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
                $table->string('type');
                $table->string('subject');
                $table->text('description');
                $table->string('screenshot_path')->nullable();
                $table->string('status')->default('nouveau');
                $table->text('admin_reply')->nullable();
                $table->timestamp('replied_at')->nullable();
                $table->timestamps();
            });
        }

        if (!Schema::hasTable('admin_messages')) {
            Schema::create('admin_messages', function (Blueprint $table) {
                $table->id();
                $table->foreignId('sender_id')->constrained('users')->cascadeOnDelete();
                $table->string('subject');
                $table->text('message');
                $table->unsignedInteger('recipient_count')->default(0);
                $table->unsignedInteger('success_count')->default(0);
                $table->unsignedInteger('failure_count')->default(0);
                $table->timestamps();
            });
        }

        if (!Schema::hasTable('admin_message_recipients')) {
            Schema::create('admin_message_recipients', function (Blueprint $table) {
                $table->id();
                $table->foreignId('admin_message_id')->constrained('admin_messages')->cascadeOnDelete();
                $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
                $table->string('email');
                $table->string('status')->default('envoye');
                $table->text('error')->nullable();
                $table->timestamps();
            });
        }

        if (!Schema::hasTable('site_updates')) {
            Schema::create('site_updates', function (Blueprint $table) {
                $table->id();
                $table->uuid('uuid')->unique();
                $table->foreignId('created_by')->constrained('users')->cascadeOnDelete();
                $table->string('title');
                $table->text('description');
                $table->date('published_on')->nullable();
                $table->string('icon')->nullable();
                $table->string('image_path')->nullable();
                $table->timestamps();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('site_updates');
        Schema::dropIfExists('admin_message_recipients');
        Schema::dropIfExists('admin_messages');
        Schema::dropIfExists('problem_reports');
        Schema::dropIfExists('feedbacks');
        Schema::dropIfExists('favorites');
        Schema::table('account_requests', function (Blueprint $table) {
            foreach (['setup_token_hash','setup_expires_at','rejection_reason','validation_deadline_at'] as $column) {
                if (Schema::hasColumn('account_requests', $column)) $table->dropColumn($column);
            }
        });
        Schema::table('users', function (Blueprint $table) {
            foreach (['phone','gender'] as $column) {
                if (Schema::hasColumn('users', $column)) $table->dropColumn($column);
            }
        });
    }
};
