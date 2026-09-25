import { useNavigate } from 'react-router-dom';
import { api } from './api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';

// Cœur des cartes livre : même action que le bouton Favori de la fiche document.
// onChange(slug, favorited) met à jour l'affichage : tout de suite, puis selon la réponse du serveur.
export function useFavoriteToggle(onChange) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  return async function toggleFavorite(document) {
    if (!user) {
      navigate('/connexion');
      return;
    }
    const before = Boolean(document.is_favorited);
    onChange(document.slug, !before);
    try {
      const result = await api.toggleFavorite(document.slug);
      const favorited = Boolean(result.favorited);
      onChange(document.slug, favorited);
      toast(favorited ? 'Ajouté aux favoris' : 'Retiré des favoris');
    } catch (err) {
      onChange(document.slug, before);
      toast(err?.data?.message || 'Impossible de mettre à jour vos favoris.');
    }
  };
}
