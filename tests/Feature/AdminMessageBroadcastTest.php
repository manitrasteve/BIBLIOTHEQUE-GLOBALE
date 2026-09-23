<?php

// L'envoi d'un message groupé (admin/bibliothécaire -> utilisateurs) ne doit plus
// bloquer la requête HTTP sur les envois SMTP : il part dans une tâche de fond
// (SendAdminBroadcastJob) qui écrit les destinataires, les notifications et les
// compteurs. En test, QUEUE_CONNECTION=sync exécute la tâche immédiatement.

use App\Models\AdminMessage;
use App\Models\AdminMessageRecipient;
use App\Models\AppNotification;
use App\Models\User;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;

test('un envoi groupé crée le message, les destinataires, les notifications et les compteurs', function () {
    Mail::fake();

    $admin = User::factory()->create(['role' => 'administrateur', 'is_active' => true]);
    $recipients = User::factory()->count(3)->create(['role' => 'etudiant', 'is_active' => true]);

    Sanctum::actingAs($admin);

    $response = $this->postJson('/api/admin-messages', [
        'subject' => 'Info importante',
        'message' => "Bonjour,\n\nCeci est un test.",
        'send_to_all' => true,
    ]);

    $response->assertCreated();

    $message = AdminMessage::first();
    expect($message)->not->toBeNull();
    expect($message->recipient_count)->toBe(3);
    expect($message->success_count)->toBe(3);
    expect($message->failure_count)->toBe(0);

    foreach ($recipients as $recipient) {
        expect(AdminMessageRecipient::where('admin_message_id', $message->id)
            ->where('user_id', $recipient->id)
            ->where('status', 'envoye')
            ->exists())->toBeTrue();

        expect(AppNotification::where('user_id', $recipient->id)
            ->where('type', 'message_admin')
            ->exists())->toBeTrue();
    }
});

test('un envoi groupé sans destinataire actif est refusé avant toute tâche', function () {
    Mail::fake();

    $admin = User::factory()->create(['role' => 'administrateur', 'is_active' => true]);
    User::factory()->create(['role' => 'etudiant', 'is_active' => false]);

    Sanctum::actingAs($admin);

    $this->postJson('/api/admin-messages', [
        'subject' => 'Info',
        'message' => 'Contenu',
        'send_to_all' => true,
    ])->assertStatus(422);

    expect(AdminMessage::count())->toBe(0);
});
