import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';

function MovieDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [movie, setMovie] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [isInWatchlist, setIsInWatchlist] = useState(false);
  const [isInWatched, setIsInWatched] = useState(false);
  const [isInFavorites, setIsInFavorites] = useState(false);

  // Load session and check status across lists
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      checkAllListsStatus(id, session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      checkAllListsStatus(id, session);
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, [id]);

  // Load movie + recommendations
  useEffect(() => {
    axios.get(`http://localhost:8000/api/movies/${id}`)
      .then(res => {
        setMovie(res.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));

    axios.get(`http://localhost:8000/api/movies/${id}/recommend`)
      .then(res => setRecommendations(res.data.slice(0, 8)))
      .catch(() => {});
  }, [id]);

  const checkAllListsStatus = async (movieId, currentSession) => {
    const idStr = String(movieId);
    if (currentSession?.user) {
      try {
        // Query each dedicated table separately
        const [wlRes, waRes, favRes] = await Promise.all([
          supabase.from('watchlist').select('movie_id').eq('user_id', currentSession.user.id).eq('movie_id', idStr),
          supabase.from('watched').select('movie_id').eq('user_id', currentSession.user.id).eq('movie_id', idStr),
          supabase.from('favorites').select('movie_id').eq('user_id', currentSession.user.id).eq('movie_id', idStr),
        ]);
        setIsInWatchlist((wlRes.data || []).length > 0);
        setIsInWatched((waRes.data || []).length > 0);
        setIsInFavorites((favRes.data || []).length > 0);
      } catch (err) {
        console.error('Error checking list status:', err);
      }
    } else {
      const savedWatchlist = JSON.parse(localStorage.getItem('cinematch-watchlist') || '[]');
      const savedWatched = JSON.parse(localStorage.getItem('cinematch-watched') || '[]');
      const savedFavorites = JSON.parse(localStorage.getItem('cinematch-favorites') || '[]');
      
      setIsInWatchlist(savedWatchlist.some(m => String(m.id) === idStr));
      setIsInWatched(savedWatched.some(m => String(m.id) === idStr));
      setIsInFavorites(savedFavorites.some(m => String(m.id) === idStr));
    }
  };


  const toggleList = async (listType, state, setState) => {
    if (!movie) return;
    const idStr = String(movie.id);
    const storageKey = `cinematch-${listType}`;

    if (session?.user) {
      try {
        if (state) {
          // Delete from the dedicated table for this list type
          const { error } = await supabase
            .from(listType)                        // 'watchlist' | 'watched' | 'favorites'
            .delete()
            .eq('user_id', session.user.id)
            .eq('movie_id', idStr);
          if (error) throw error;
          setState(false);
        } else {
          // Insert into the dedicated table — no list_type column needed
          const { error } = await supabase
            .from(listType)
            .insert({
              user_id: session.user.id,
              movie_id: idStr,
              title: movie.title,
              poster_path: movie.poster_path,
              genre_ids: movie.genre_ids ? JSON.stringify(movie.genre_ids) : null,
              genres: movie.genres || null,
              release_date: movie.release_date || null,
              vote_average: movie.vote_average || null
            });
          if (error) throw error;
          setState(true);
        }
      } catch (err) {
        console.error(`Error toggling ${listType} in Supabase:`, err);
      }
    } else {
      const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
      const inList = saved.some(m => String(m.id) === idStr);
      let updated;
      if (inList) {
        updated = saved.filter(m => String(m.id) !== idStr);
        setState(false);
      } else {
        updated = [...saved, movie];
        setState(true);
      }
      localStorage.setItem(storageKey, JSON.stringify(updated));
    }
  };



  // Clean Genres
  const cleanGenres = () => {
    if (!movie?.genres) return [];
    try {
      let cleaned = movie.genres.replace(/\"\"/g, '"');
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) return parsed.map(g => g.name || g);
    } catch (e) {}
    return movie.genres.split(',').map(g => g.trim());
  };

  if (loading) return <div className="text-center py-32 text-4xl">Loading cinematic experience...</div>;
  if (!movie) return <div className="text-center py-32 text-3xl">Movie not found</div>;

  return (
    <div className="max-w-7xl mx-auto px-6 py-12">
      <div className="flex flex-col lg:flex-row gap-12">
        {/* Poster */}
        <div className="lg:w-1/3">
          <div className="sticky top-24">
            <div className="relative rounded-3xl overflow-hidden shadow-2xl">
              {movie.poster_path ? (
                <img
                  src={`https://image.tmdb.org/t/p/w500${movie.poster_path}`}
                  alt={movie.title}
                  className="w-full rounded-3xl"
                />
              ) : (
                <div className="aspect-[2/3] bg-zinc-900 flex items-center justify-center text-9xl">🎥</div>
              )}
            </div>
          </div>
        </div>

        {/* Details */}
        <div className="lg:w-2/3">
          <div className="flex justify-between items-start mb-8 gap-4 flex-wrap">
            <div>
              <h1 className="text-5xl font-bold mb-3">{movie.title}</h1>
              <p className="text-3xl text-purple-400">⭐ {Number(movie.vote_average).toFixed(1)}</p>
            </div>
            
            {/* Multi-list Actions */}
            <div className="flex gap-6 items-center bg-zinc-900/60 border border-white/10 px-6 py-4 rounded-3xl backdrop-blur-xl">
              <button
                onClick={() => toggleList('watchlist', isInWatchlist, setIsInWatchlist)}
                className={`text-3xl transition-all duration-300 hover:scale-115 active:scale-95 flex items-center justify-center ${isInWatchlist ? 'text-red-500 scale-105' : 'text-gray-500 hover:text-red-400'}`}
                title={isInWatchlist ? "Remove from Watchlist" : "Add to Watchlist"}
              >
                {isInWatchlist ? '❤️' : '♡'}
              </button>
              <button
                onClick={() => toggleList('watched', isInWatched, setIsInWatched)}
                className={`text-3xl transition-all duration-300 hover:scale-115 active:scale-95 flex items-center justify-center ${isInWatched ? 'text-green-500 scale-105' : 'text-gray-500 hover:text-green-400'}`}
                title={isInWatched ? "Remove from Watched" : "Mark as Watched"}
              >
                👁️
              </button>
              <button
                onClick={() => toggleList('favorites', isInFavorites, setIsInFavorites)}
                className={`text-3xl transition-all duration-300 hover:scale-115 active:scale-95 flex items-center justify-center ${isInFavorites ? 'text-yellow-500 scale-105' : 'text-gray-500 hover:text-yellow-400'}`}
                title={isInFavorites ? "Remove from Favorites" : "Add to Favorites"}
              >
                {isInFavorites ? '⭐' : '☆'}
              </button>
            </div>
          </div>

          <p className="text-gray-300 text-lg leading-relaxed mb-10">
            {movie.overview || "No overview available."}
          </p>

          {/* Genres */}
          <div className="mb-10">
            <p className="text-gray-400 mb-3">Genres</p>
            <div className="flex flex-wrap gap-3">
              {cleanGenres().map((genre, index) => (
                <button
                  key={index}
                  onClick={() => navigate('/', { state: { genre } })}
                  className="px-5 py-2 bg-zinc-800 hover:bg-purple-600 transition-all text-white rounded-3xl text-sm font-medium border border-white/5 cursor-pointer active:scale-95"
                >
                  {genre}
                </button>
              ))}
            </div>
          </div>

                    {/* Where to Watch in US */}
          <div className="mb-12">
            <p className="text-gray-400 mb-4 text-lg font-medium">Where to Watch in US</p>

            {movie.watch_providers ? (
              <>
                {/* Stream */}
                {movie.watch_providers.flatrate && movie.watch_providers.flatrate.length > 0 && (
                  <div className="mb-8">
                    <p className="text-green-400 text-sm mb-3">▶️ STREAM</p>
                    <div className="flex gap-4 flex-wrap">
                      {movie.watch_providers.flatrate.map(provider => (
                        <img
                          key={provider.provider_id}
                          src={`https://image.tmdb.org/t/p/w92${provider.logo_path}`}
                          alt={provider.provider_name}
                          className="w-12 h-12 rounded-xl"
                          title={provider.provider_name}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Rent */}
                {movie.watch_providers.rent && movie.watch_providers.rent.length > 0 && (
                  <div className="mb-8">
                    <p className="text-yellow-400 text-sm mb-3">📥 RENT</p>
                    <div className="flex gap-4 flex-wrap">
                      {movie.watch_providers.rent.map(provider => (
                        <img
                          key={provider.provider_id}
                          src={`https://image.tmdb.org/t/p/w92${provider.logo_path}`}
                          alt={provider.provider_name}
                          className="w-12 h-12 rounded-xl"
                          title={provider.provider_name}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Buy */}
                {movie.watch_providers.buy && movie.watch_providers.buy.length > 0 && (
                  <div>
                    <p className="text-blue-400 text-sm mb-3">🛒 BUY</p>
                    <div className="flex gap-4 flex-wrap">
                      {movie.watch_providers.buy.map(provider => (
                        <img
                          key={provider.provider_id}
                          src={`https://image.tmdb.org/t/p/w92${provider.logo_path}`}
                          alt={provider.provider_name}
                          className="w-12 h-12 rounded-xl"
                          title={provider.provider_name}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-gray-500 italic">No streaming information available at the moment.</p>
            )}
          </div>
        </div>
      </div>

      {/* Recommendations */}
      <div className="mt-16">
        <h2 className="text-3xl font-bold mb-8">Similar recommendations</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {recommendations.map(rec => (
            <Link key={rec.id} to={`/movie/${rec.id}`} className="group">
              <div className="aspect-[2/3] rounded-3xl overflow-hidden shadow-xl hover:shadow-purple-500/30 transition-all">
                {rec.poster_path ? (
                  <img
                    src={`https://image.tmdb.org/t/p/w500${rec.poster_path}`}
                    alt={rec.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                ) : (
                  <div className="w-full h-full bg-zinc-900 flex items-center justify-center text-6xl">🎥</div>
                )}
              </div>
              <p className="mt-3 text-center font-medium group-hover:text-purple-400">{rec.title}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

export default MovieDetail;