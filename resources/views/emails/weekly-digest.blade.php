{{--
    Digest hebdomadaire des membres.

    Variables :
      $memberName   (string)  Prénom ou nom du destinataire
      $documents    (array)   Nouveautés : [title, type, url]
      $resume       (array|null)  Lecture à reprendre : [title, page, total, percent, url]
      $catalogueUrl (string)  Lien vers le catalogue

    Mise en page à base de tableaux et de styles en ligne, pour rester lisible dans les
    principaux clients e-mail.
--}}
@php
    $logoPath = public_path('images/logo-universite-mahajanga.png');
    if (isset($message) && is_object($message) && method_exists($message, 'embedData') && is_file($logoPath)) {
        $logoSrc = $message->embedData(file_get_contents($logoPath), 'logo-universite-mahajanga.png', 'image/png');
    } else {
        $logoSrc = rtrim(config('app.url'), '/') . '/images/logo-universite-mahajanga.png';
    }
@endphp
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="light dark">
    <meta name="supported-color-schemes" content="light dark">
    <title>Votre semaine de lecture</title>
</head>
<body style="margin:0; padding:0; background-color:#f1f5f9; font-family:Arial, Helvetica, sans-serif; color:#1e293b; -webkit-text-size-adjust:100%;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f1f5f9;">
    <tr>
        <td align="center" style="padding:24px 12px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px; background-color:#ffffff; border:1px solid #e2e8f0; border-radius:12px;">

                {{-- EN-TÊTE --}}
                <tr>
                    <td align="center" style="padding:28px 24px 20px 24px; border-bottom:3px solid #1d4ed8; background-color:#ffffff; border-radius:12px 12px 0 0;">
                        <img src="{{ $logoSrc }}" alt="Université de Mahajanga" width="88" style="display:block; width:88px; max-width:88px; height:auto; border:0; margin:0 auto 12px auto;">
                        <div style="font-size:20px; line-height:26px; font-weight:bold; color:#1e3a8a;">Bibliothèque Numérique</div>
                        <div style="font-size:12px; line-height:18px; letter-spacing:1px; text-transform:uppercase; color:#475569; margin-top:2px;">Université de Mahajanga</div>
                    </td>
                </tr>

                {{-- CONTENU --}}
                <tr>
                    <td style="padding:28px 24px 8px 24px; background-color:#ffffff;">
                        <h1 style="margin:0 0 16px 0; font-size:22px; line-height:30px; color:#0f172a;">Votre semaine de lecture</h1>
                        <p style="margin:0 0 20px 0; font-size:16px; line-height:24px; color:#1e293b;">Bonjour {{ $memberName }},</p>

                        {{-- REPRENDRE LA LECTURE --}}
                        @if ($resume)
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px 0; background-color:#eff6ff; border:1px solid #bfdbfe; border-radius:10px;">
                                <tr>
                                    <td style="padding:16px 18px;">
                                        <div style="font-size:12px; line-height:18px; text-transform:uppercase; letter-spacing:.5px; color:#475569; font-weight:bold;">Reprendre votre lecture</div>
                                        <div style="font-size:18px; line-height:26px; color:#1e3a8a; font-weight:bold; margin-top:4px; word-break:break-word;">{{ $resume['title'] }}</div>
                                        @if ($resume['total'])
                                            <div style="font-size:14px; line-height:20px; color:#475569; margin-top:4px;">Page {{ $resume['page'] }} sur {{ $resume['total'] }}@if ($resume['percent'] !== null) · {{ $resume['percent'] }} %@endif</div>
                                        @endif
                                        <a href="{{ $resume['url'] }}" target="_blank" style="display:inline-block; margin-top:12px; padding:10px 20px; font-size:14px; line-height:18px; font-weight:bold; color:#ffffff; background-color:#1d4ed8; text-decoration:none; border-radius:8px;">Continuer la lecture</a>
                                    </td>
                                </tr>
                            </table>
                        @endif

                        {{-- NOUVEAUTÉS --}}
                        @if (!empty($documents))
                            <div style="font-size:12px; line-height:18px; text-transform:uppercase; letter-spacing:.5px; color:#475569; font-weight:bold; margin:0 0 10px 0;">{{ count($documents) }} nouveauté{{ count($documents) > 1 ? 's' : '' }} cette semaine</div>
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                                @foreach ($documents as $doc)
                                    <tr>
                                        <td style="padding:10px 0; border-bottom:1px solid #f1f5f9;">
                                            <a href="{{ $doc['url'] }}" target="_blank" style="font-size:16px; line-height:22px; color:#1e3a8a; font-weight:bold; text-decoration:none; word-break:break-word;">{{ $doc['title'] }}</a>
                                            @if (!empty($doc['type']))
                                                <div style="font-size:13px; line-height:18px; color:#64748b; margin-top:2px;">{{ ucfirst($doc['type']) }}</div>
                                            @endif
                                        </td>
                                    </tr>
                                @endforeach
                            </table>
                        @endif
                    </td>
                </tr>

                {{-- ACTION --}}
                <tr>
                    <td align="center" style="padding:20px 24px 8px 24px; background-color:#ffffff;">
                        <a href="{{ $catalogueUrl }}" target="_blank" style="display:inline-block; padding:15px 30px; font-size:16px; line-height:20px; font-weight:bold; color:#ffffff; background-color:#1d4ed8; text-decoration:none; text-transform:uppercase; letter-spacing:.5px; border-radius:10px;">Ouvrir la bibliothèque</a>
                    </td>
                </tr>

                {{-- PIED DE PAGE --}}
                <tr>
                    <td align="center" style="padding:24px 24px 26px 24px; background-color:#ffffff; border-radius:0 0 12px 12px;">
                        <div style="border-top:1px solid #e2e8f0; padding-top:16px; font-size:13px; line-height:20px; color:#475569;">
                            <strong>Université de Mahajanga</strong><br>
                            Bibliothèque Numérique
                        </div>
                    </td>
                </tr>
            </table>
        </td>
    </tr>
</table>
</body>
</html>
