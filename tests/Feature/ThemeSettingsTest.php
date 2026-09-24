<?php

use App\Http\Controllers\Api\ThemeController;
use App\Models\ThemeVersion;
use App\Models\User;
use App\Support\ThemePalette;
use Illuminate\Support\Facades\Cache;
use Laravel\Sanctum\Sanctum;

function themeAdmin(): User
{
    $admin = User::factory()->create(['role' => 'administrateur', 'is_active' => true]);
    Sanctum::actingAs($admin);

    return $admin;
}

function customColors(array $light = [], array $dark = []): array
{
    $colors = ThemePalette::defaults();
    $colors['light'] = array_merge($colors['light'], $light);
    $colors['dark'] = array_merge($colors['dark'], $dark);

    return $colors;
}

beforeEach(fn () => Cache::flush());

it('réserve la gestion du thème à l\'administrateur', function (string $role) {
    Sanctum::actingAs(User::factory()->create(['role' => $role, 'is_active' => true]));

    $this->getJson('/api/admin/theme')->assertForbidden();
    $this->putJson('/api/admin/theme/draft', ['colors' => customColors()])->assertForbidden();
    $this->postJson('/api/admin/theme/publish')->assertForbidden();
    $this->postJson('/api/admin/theme/restore-default')->assertForbidden();
    $this->postJson('/api/admin/theme/preview', ['colors' => customColors()])->assertForbidden();
})->with(['etudiant', 'enseignant', 'chercheur', 'bibliothecaire']);

it('refuse l\'accès sans connexion', function () {
    $this->getJson('/api/admin/theme')->assertUnauthorized();
});

it('renvoie les couleurs par défaut sans thème publié', function () {
    themeAdmin();

    $this->getJson('/api/admin/theme')->assertOk()
        ->assertJsonPath('defaults.light.primary', '#1f3a5f')
        ->assertJsonPath('defaults.dark.background', '#0b1220')
        ->assertJsonPath('draft', null)
        ->assertJsonPath('published', null);

    expect(ThemeController::activeCss())->toBe('');
});

it('refuse une couleur HEX invalide et n\'injecte rien de non validé', function (string $value) {
    themeAdmin();

    $this->putJson('/api/admin/theme/draft', ['colors' => customColors(['primary' => $value])])
        ->assertStatus(422)
        ->assertJsonValidationErrors('colors.light.primary');

    expect(ThemeVersion::count())->toBe(0);
})->with(['rouge', '#12345', '#1234567', '#gggggg', 'red;}body{display:none', '</style><script>alert(1)</script>', '']);

it('exige les deux modes et toutes les couleurs', function () {
    themeAdmin();

    $colors = customColors();
    unset($colors['dark']['border']);

    $this->putJson('/api/admin/theme/draft', ['colors' => $colors])
        ->assertStatus(422)
        ->assertJsonValidationErrors('colors.dark.border');
});

it('enregistre un brouillon sans modifier le thème public', function () {
    themeAdmin();

    $this->putJson('/api/admin/theme/draft', ['colors' => customColors(['primary' => '#0F766E'])])
        ->assertOk()
        ->assertJsonPath('draft.colors.light.primary', '#0f766e'); // normalisé en minuscules

    expect(ThemeController::activeCss())->toBe('')
        ->and(ThemeVersion::draft())->not->toBeNull();
});

it('publie le brouillon : le thème devient actif et le brouillon disparaît', function () {
    themeAdmin();

    $this->putJson('/api/admin/theme/draft', ['colors' => customColors(
        ['primary' => '#0f766e', 'secondary' => '#115e59', 'accent' => '#ecfdf5', 'background' => '#f8fafc', 'surface' => '#fefefe', 'foreground' => '#111827', 'border' => '#cbd5e1'],
        ['primary' => '#14b8a6', 'background' => '#020617'],
    )])->assertOk();
    expect(ThemeController::activeCss())->toBe(''); // mis en cache avant publication

    $this->postJson('/api/admin/theme/publish')->assertOk()->assertJsonPath('published.version', 1);

    $css = ThemeController::activeCss();
    expect($css)
        ->toContain('--site-light-primary:#0f766e')
        ->toContain('--site-light-secondary:#115e59')
        ->toContain('--site-light-accent:#ecfdf5')
        ->toContain('--site-light-background:#f8fafc')
        ->toContain('--site-light-surface:#fefefe')
        ->toContain('--site-light-foreground:#111827')
        ->toContain('--site-light-border:#cbd5e1')
        ->toContain('--site-light-primary-deep:color-mix(in oklab, #0f766e 80%, #000000)')
        ->toContain('--site-dark-primary:#14b8a6')
        ->toContain('--site-dark-background:#020617')
        ->not->toContain('--site-dark-border'); // couleur sombre non modifiée : aucune variable

    expect(ThemeVersion::draft())->toBeNull();
});

it('injecte le thème publié dans les pages du site', function () {
    themeAdmin();
    $this->putJson('/api/admin/theme/draft', ['colors' => customColors(['primary' => '#7c3aed'])]);
    $this->postJson('/api/admin/theme/publish')->assertOk();

    $this->get('/')->assertOk()
        ->assertSee('<style id="site-theme">', false)
        ->assertSee('--site-light-primary:#7c3aed', false);
});

it('n\'injecte aucun style tant que le thème d\'origine est actif', function () {
    $this->get('/')->assertOk()->assertDontSee('id="site-theme"', false);
});

it('refuse de publier sans brouillon', function () {
    themeAdmin();

    $this->postJson('/api/admin/theme/publish')->assertStatus(422);
});

it('restaure le thème par défaut dans une nouvelle version sans effacer l\'historique', function () {
    themeAdmin();
    $this->putJson('/api/admin/theme/draft', ['colors' => customColors(['primary' => '#b91c1c'])]);
    $this->postJson('/api/admin/theme/publish')->assertOk();
    $this->putJson('/api/admin/theme/draft', ['colors' => customColors(['primary' => '#0369a1'])]); // brouillon en cours

    $this->postJson('/api/admin/theme/restore-default')->assertOk()
        ->assertJsonPath('published.version', 2)
        ->assertJsonPath('published.is_default', true);

    expect(ThemeController::activeCss())->toBe('') // couleurs d'origine
        ->and(ThemeVersion::published()->count())->toBe(2) // historique conservé
        ->and(ThemeVersion::draft())->toBeNull();

    $this->getJson('/api/admin/theme/versions')->assertOk()->assertJsonCount(2);
});

it('calcule un aperçu sans rien enregistrer', function () {
    themeAdmin();

    $this->postJson('/api/admin/theme/preview', ['colors' => customColors([], ['foreground' => '#fafafa'])])
        ->assertOk()
        ->assertJsonPath('css', fn ($css) => str_contains($css, '--site-dark-foreground:#fafafa') && str_contains($css, '--site-dark-fg-muted:'));

    expect(ThemeVersion::count())->toBe(0)->and(ThemeController::activeCss())->toBe('');
});

it('garde les couleurs par défaut synchronisées avec app.css', function () {
    $css = file_get_contents(resource_path('css/app.css'));

    foreach (ThemePalette::DEFAULTS as $mode => $colors) {
        foreach ($colors as $key => $hex) {
            expect($css)->toContain("var(--site-{$mode}-{$key}, {$hex})");
        }
    }
});
