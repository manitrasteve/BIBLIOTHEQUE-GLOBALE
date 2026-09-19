{{--
    Gabarit commun des e-mails de la Bibliothèque Numérique.

    Variables :
      $heading      (string)  Titre affiché sous le logo
      $paragraphs   (array)   Paragraphes de texte (échappés)
      $details      (array)   Libellé => valeur, affichés dans un encadré
      $buttonLabel  (string)  Texte du bouton d'action (optionnel)
      $buttonUrl    (string)  Lien exact du bouton (optionnel)
      $note         (string)  Information de sécurité / durée du lien (optionnel)
      $footerNote   (string)  Mention complémentaire en bas de page (optionnel)

    Mise en page à base de tableaux et de styles en ligne, pour rester lisible
    dans les principaux clients e-mail. Pas de dégradé, de rgba() ni d'ombre.
--}}
@php
    $logoSrc = null;
    $logoPath = public_path('images/logo-universite-mahajanga.png');

    if (isset($message) && is_object($message) && method_exists($message, 'embedData') && is_file($logoPath)) {
        // Logo joint à l'e-mail (cid) : s'affiche même si le serveur n'est pas joignable depuis Internet.
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
    <title>{{ $heading }}</title>
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
                        <h1 style="margin:0 0 16px 0; font-size:22px; line-height:30px; color:#0f172a;">{{ $heading }}</h1>

                        @foreach (($paragraphs ?? []) as $paragraph)
                            <p style="margin:0 0 14px 0; font-size:16px; line-height:24px; color:#1e293b; white-space:pre-line;">{{ $paragraph }}</p>
                        @endforeach

                        @if (!empty($details))
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 18px 0; background-color:#eff6ff; border:1px solid #bfdbfe; border-radius:10px;">
                                @foreach ($details as $label => $value)
                                    <tr>
                                        <td style="padding:12px 16px;">
                                            <div style="font-size:12px; line-height:18px; text-transform:uppercase; letter-spacing:.5px; color:#475569; font-weight:bold;">{{ $label }}</div>
                                            <div style="font-size:18px; line-height:26px; color:#1e3a8a; font-weight:bold; word-break:break-word;">{{ $value }}</div>
                                        </td>
                                    </tr>
                                @endforeach
                            </table>
                        @endif
                    </td>
                </tr>

                {{-- ACTION --}}
                @if (!empty($buttonUrl) && !empty($buttonLabel))
                    <tr>
                        <td align="center" style="padding:8px 24px 8px 24px; background-color:#ffffff;">
                            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
                                <tr>
                                    <td align="center" bgcolor="#1d4ed8" style="background-color:#1d4ed8; border-radius:10px;">
                                        <a href="{{ $buttonUrl }}" target="_blank" style="display:inline-block; padding:15px 30px; font-size:16px; line-height:20px; font-weight:bold; color:#ffffff; text-decoration:none; text-transform:uppercase; letter-spacing:.5px; border-radius:10px;">{{ $buttonLabel }}</a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                @endif

                {{-- INFORMATION DE SÉCURITÉ / DURÉE --}}
                @if (!empty($note))
                    <tr>
                        <td style="padding:18px 24px 8px 24px; background-color:#ffffff;">
                            <p style="margin:0; padding:12px 14px; font-size:14px; line-height:21px; color:#9a3412; background-color:#fff7ed; border:1px solid #fed7aa; border-radius:8px;">{{ $note }}</p>
                        </td>
                    </tr>
                @endif

                {{-- PIED DE PAGE --}}
                <tr>
                    <td align="center" style="padding:24px 24px 26px 24px; background-color:#ffffff; border-radius:0 0 12px 12px;">
                        @if (!empty($footerNote))
                            <p style="margin:0 0 14px 0; font-size:13px; line-height:20px; color:#64748b;">{{ $footerNote }}</p>
                        @endif
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
