import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';

function Watchlist({ listType = 'watchlist' }) {
  const [watchlist, setWatchlist] = useState([]);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  // Dynamic configuration based on listType
  const listConfigs = {
    watchlist: {
      title: '❤️ My Watchlist',
      desc: 'Movies you want to watch later',
      emptyIcon: '♡',
      emptyText: 'Your watchlist is empty',
      emptySub: 'Explore and add movies you want to watch by clicking the ❤️ button on any movie details page.',
      storageKey: 'cinematch-watchlist',
      activeColor: 'text-purple-500/40',
    },
    watched: {
      title: '👁️ Watched Movies',
      desc: 'Movies you have already watched',
      emptyIcon: '👁️',
      emptyText: 'You haven\'t marked any movies as watched',
      emptySub: 'Keep track of your viewing history by clicking the 👁️ button on any movie details page.',
      storageKey: 'cinematch-watched',
      activeColor: 'text-green-500/40',
    },
    favorites: {
      title: '⭐ My Favorites',
      desc: 'Your absolute favorite movies',
      emptyIcon: '⭐',
      emptyText: 'No favorites added yet',
      emptySub: 'Show some love! Add your top movies to favorites by clicking the ⭐ button on any movie details page.',
      storageKey: 'cinematch-favorites',
      activeColor: 'text-yellow-500/40',
    },
  };

  const config = listConfigs[listType] || listConfigs.watchlist;

  useEffect(() => {
    // Check current auth session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      fetchWatchlist(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      fetchWatchlist(session);
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, [listType]); // Refetch if listType changes

  const fetchWatchlist = async (currentSession) => {
    setLoading(true);
    if (currentSession?.user) {
      try {
        // Each list type now has its own dedicated table
        const { data, error } = await supabase
          .from(listType)               // 'watchlist' | 'watched' | 'favorites'
          .select('*')
          .eq('user_id', currentSession.user.id)
          .order('created_at', { ascending: false });

        if (error) throw error;

        const formatted = data.map(item => ({
          id: item.movie_id,
          title: item.title,
          poster_path: item.poster_path
        }));
        setWatchlist(formatted);
      } catch (err) {
        console.error(`Error fetching ${listType} from Supabase:`, err);
      }
    } else {
      // Fallback to local storage
      const saved = JSON.parse(localStorage.getItem(config.storageKey) || '[]');
      setWatchlist(saved);
    }
    setLoading(false);
  };


  const removeFromWatchlist = async (id) => {
    const idStr = String(id);
    if (session?.user) {
      try {
        const { error } = await supabase
          .from(listType)               // 'watchlist' | 'watched' | 'favorites'
          .delete()
          .eq('user_id', session.user.id)
          .eq('movie_id', idStr);

        if (error) throw error;
        setWatchlist(prev => prev.filter(movie => String(movie.id) !== idStr));
      } catch (err) {
        console.error(`Error deleting from Supabase ${listType}:`, err);
      }
    } else {
      const updated = watchlist.filter(movie => String(movie.id) !== idStr);
      setWatchlist(updated);
      localStorage.setItem(config.storageKey, JSON.stringify(updated));
    }
  };


  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-12">
      <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-white via-gray-200 to-zinc-500 bg-clip-text text-transparent">
        {config.title}
      </h1>
      <p className="text-gray-400 mb-12">
        {session ? 'Your cloud-saved list' : `Saved to this browser (Sign in to sync your ${listType} list)`}
      </p>

      {watchlist.length === 0 ? (
        <div className="text-center py-32 bg-zinc-900/20 rounded-3xl border border-white/5 backdrop-blur-sm">
          <div className={`text-7xl mb-6 ${config.activeColor}`}>{config.emptyIcon}</div>
          <p className="text-3xl text-gray-400 font-semibold">{config.emptyText}</p>
          <p className="text-gray-500 mt-4 max-w-md mx-auto text-sm">
            {config.emptySub}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-8">
          {watchlist.map(movie => (
            <div key={movie.id} className="relative group hover:scale-[1.03] transition-all duration-300">
              <Link to={`/movie/${movie.id}`}>
                <div className="aspect-[2/3] rounded-3xl overflow-hidden shadow-2xl border border-white/5 group-hover:border-purple-500/30 transition-colors">
                  {movie.poster_path ? (
                    <img 
                      src={`https://image.tmdb.org/t/p/w500${movie.poster_path}`}
                      alt={movie.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-zinc-900 flex items-center justify-center text-7xl">🎥</div>
                  )}
                </div>
              </Link>
              <button
                onClick={() => removeFromWatchlist(movie.id)}
                className="absolute top-4 right-4 bg-red-600/90 hover:bg-red-600 w-9 h-9 rounded-full flex items-center justify-center text-white text-base shadow-lg transition-all active:scale-90 hover:scale-110"
                title={`Remove from ${listType}`}
              >
                ✕
              </button>
              <p className="mt-4 font-semibold text-center line-clamp-2 text-sm text-gray-200 group-hover:text-purple-400 transition-colors">
                {movie.title}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Watchlist;