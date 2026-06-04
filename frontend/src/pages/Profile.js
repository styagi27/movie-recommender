import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';

// Genre ID → Name mapping (as perTMDB standard)
const TMDB_GENRES = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
  99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History',
  27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi',
  10770: 'TV Movie', 53: 'Thriller', 10752: 'War', 37: 'Western'
};

// Parse genre names from a watchlist row
function parseGenresFromRow(row) {
  const names = [];

  // Try genre_ids column (stored as JSON array string)
  if (row.genre_ids) {
    try {
      const ids = JSON.parse(row.genre_ids);
      if (Array.isArray(ids)) {
        ids.forEach(id => {
          if (TMDB_GENRES[id]) names.push(TMDB_GENRES[id]);
        });
      }
    } catch (_) { }
  }

  // Try genres column (stored as comma-separated string or JSON array)
  if (names.length === 0 && row.genres) {
    try {
      const cleaned = row.genres.replace(/""/g, '"');
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) {
        parsed.forEach(g => { if (g.name) names.push(g.name); });
        return names;
      }
    } catch (_) { }
    // Plain comma separated
    row.genres.split(',').forEach(g => {
      const trimmed = g.trim();
      if (trimmed) names.push(trimmed);
    });
  }

  return names;
}

// Derive top genre from favorites rows
function computeFavoriteGenre(favoriteRows) {
  const freq = {};
  favoriteRows.forEach(row => {
    parseGenresFromRow(row).forEach(genre => {
      freq[genre] = (freq[genre] || 0) + 1;
    });
  });
  const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
  return sorted.length > 0 ? { genre: sorted[0][0], breakdown: sorted } : { genre: null, breakdown: [] };
}

// Stat Card
function StatCard({ icon, label, value, gradient, delay = 0 }) {
  return (
    <div
      className="stat-card"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className={`stat-icon-wrapper ${gradient}`}>
        <span className="stat-icon">{icon}</span>
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

//  Mini Movie Grid
function MiniMovieGrid({ movies, emptyText, emptyIcon, linkTo }) {
  if (movies.length === 0) {
    return (
      <div className="mini-grid-empty">
        <span className="mini-empty-icon">{emptyIcon}</span>
        <p>{emptyText}</p>
      </div>
    );
  }
  return (
    <div className="mini-movie-grid">
      {movies.map(movie => (
        <Link key={movie.movie_id || movie.id} to={`/movie/${movie.movie_id || movie.id}`} className="mini-movie-card">
          {movie.poster_path ? (
            <img
              src={`https://image.tmdb.org/t/p/w342${movie.poster_path}`}
              alt={movie.title}
              className="mini-movie-poster"
            />
          ) : (
            <div className="mini-movie-placeholder">🎥</div>
          )}
          <div className="mini-movie-overlay">
            <p className="mini-movie-title">{movie.title}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}

// Genre Bar Chart
function GenreBreakdown({ breakdown }) {
  if (!breakdown || breakdown.length === 0) return null;
  const maxCount = breakdown[0][1];
  const COLORS = [
    '#a855f7', '#ec4899', '#3b82f6', '#10b981', '#f59e0b',
    '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#84cc16'
  ];
  return (
    <div className="genre-breakdown">
      <h3 className="section-subtitle">Genre Breakdown</h3>
      <div className="genre-bars">
        {breakdown.slice(0, 8).map(([genre, count], i) => (
          <div key={genre} className="genre-bar-row">
            <span className="genre-bar-label">{genre}</span>
            <div className="genre-bar-track">
              <div
                className="genre-bar-fill"
                style={{
                  width: `${(count / maxCount) * 100}%`,
                  backgroundColor: COLORS[i % COLORS.length],
                  animationDelay: `${i * 80}ms`
                }}
              />
            </div>
            <span className="genre-bar-count">{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Main Profile Component
function Profile() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ watched: 0, watchlist: 0, favorites: 0 });
  const [favoriteGenre, setFavoriteGenre] = useState(null);
  const [genreBreakdown, setGenreBreakdown] = useState([]);
  const [recentWatched, setRecentWatched] = useState([]);
  const [recentWatchlist, setRecentWatchlist] = useState([]);
  const [recentFavorites, setRecentFavorites] = useState([]);
  const [memberSince, setMemberSince] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        fetchProfileData(session);
        // Member since from session metadata
        const createdAt = session.user.created_at;
        if (createdAt) {
          setMemberSince(new Date(createdAt).toLocaleDateString('en-US', {
            month: 'long', year: 'numeric'
          }));
        }
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) {
        fetchProfileData(session);
      } else {
        setLoading(false);
      }
    });
    return () => subscription?.unsubscribe();
  }, []);

  const fetchProfileData = async (currentSession) => {
    setLoading(true);
    try {
      // Query each dedicated table in parallel
      const [wlRes, waRes, favRes] = await Promise.all([
        supabase.from('watchlist').select('*').eq('user_id', currentSession.user.id).order('created_at', { ascending: false }),
        supabase.from('watched').select('*').eq('user_id', currentSession.user.id).order('created_at', { ascending: false }),
        supabase.from('favorites').select('*').eq('user_id', currentSession.user.id).order('created_at', { ascending: false }),
      ]);

      const watchlistData = wlRes.data || [];
      const watchedData = waRes.data || [];
      const favoritesData = favRes.data || [];

      setStats({
        watched: watchedData.length,
        watchlist: watchlistData.length,
        favorites: favoritesData.length
      });

      setRecentWatched(watchedData.slice(0, 6));
      setRecentWatchlist(watchlistData.slice(0, 6));
      setRecentFavorites(favoritesData.slice(0, 6));

      const { genre, breakdown } = computeFavoriteGenre(favoritesData);
      setFavoriteGenre(genre);
      setGenreBreakdown(breakdown);
    } catch (err) {
      console.error('Error fetching profile data:', err);
    }
    setLoading(false);
  };

  // Not signed in
  if (!loading && !session) {
    return (
      <div className="profile-unauthenticated">
        <div className="unauth-glow unauth-glow-1" />
        <div className="unauth-glow unauth-glow-2" />
        <div className="unauth-card">
          <div className="unauth-icon">👤</div>
          <h2 className="unauth-title">Your Profile Awaits</h2>
          <p className="unauth-desc">
            Sign in to see your movies watched, watchlist count, favorite genres, and a full dashboard of your cinema journey.
          </p>
          <Link to="/auth" className="unauth-cta">Sign In to View Profile</Link>
        </div>
      </div>
    );
  }

  // Loading
  if (loading) {
    return (
      <div className="profile-loading">
        <div className="profile-spinner" />
        <p>Building your profile...</p>
      </div>
    );
  }

  const displayName = session?.user?.user_metadata?.full_name
    || session?.user?.email?.split('@')[0]
    || 'Cinephile';
  const email = session?.user?.email || '';
  const initials = displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  return (
    <div className="profile-page">
      {/* Background glows */}
      <div className="profile-glow profile-glow-1" />
      <div className="profile-glow profile-glow-2" />
      <div className="profile-glow profile-glow-3" />

      <div className="profile-container">

        {/* Hero / Identity Section */}
        <div className="profile-hero">
          <div className="profile-avatar">
            <span className="profile-initials">{initials}</span>
            <div className="profile-avatar-ring" />
          </div>
          <div className="profile-identity">
            <h1 className="profile-name">{displayName}</h1>
            <p className="profile-email">{email}</p>
            {memberSince && (
              <p className="profile-member-since">🎬 Member since {memberSince}</p>
            )}
          </div>
          {favoriteGenre && (
            <div className="profile-fav-genre-badge">
              <span className="fav-genre-label">Favorite Genre</span>
              <span className="fav-genre-name">🎭 {favoriteGenre}</span>
            </div>
          )}
        </div>

        {/* Stats Row */}
        <div className="stats-grid">
          <StatCard
            icon="👁️"
            label="Movies Watched"
            value={stats.watched}
            gradient="gradient-green"
            delay={0}
          />
          <StatCard
            icon="❤️"
            label="Watchlist"
            value={stats.watchlist}
            gradient="gradient-pink"
            delay={100}
          />
          <StatCard
            icon="⭐"
            label="Favorites"
            value={stats.favorites}
            gradient="gradient-yellow"
            delay={200}
          />
          <StatCard
            icon="🎭"
            label="Favorite Genre"
            value={favoriteGenre || '—'}
            gradient="gradient-purple"
            delay={300}
          />
        </div>

        {/*  Genre Breakdown */}
        {genreBreakdown.length > 0 && (
          <div className="profile-section">
            <GenreBreakdown breakdown={genreBreakdown} />
          </div>
        )}

        {/*  Recent Watched */}
        <div className="profile-section">
          <div className="section-header">
            <h2 className="section-title">👁️ Recently Watched</h2>
            <Link to="/watched" className="section-link">View All ({stats.watched})</Link>
          </div>
          <MiniMovieGrid
            movies={recentWatched}
            emptyText="No watched movies yet"
            emptyIcon="👁️"
            linkTo="/watched"
          />
        </div>

        {/*  Watchlist */}
        <div className="profile-section">
          <div className="section-header">
            <h2 className="section-title">❤️ Watchlist</h2>
            <Link to="/watchlist" className="section-link">View All ({stats.watchlist})</Link>
          </div>
          <MiniMovieGrid
            movies={recentWatchlist}
            emptyText="Your watchlist is empty"
            emptyIcon="♡"
            linkTo="/watchlist"
          />
        </div>

        {/*  Favorites  */}
        <div className="profile-section">
          <div className="section-header">
            <h2 className="section-title">⭐ Favorites</h2>
            <Link to="/favorites" className="section-link">View All ({stats.favorites})</Link>
          </div>
          <MiniMovieGrid
            movies={recentFavorites}
            emptyText="No favorites yet"
            emptyIcon="☆"
            linkTo="/favorites"
          />
        </div>

      </div>

      {/* Inline styles for Profile page */}
      <style>{`
        .profile-page {
          min-height: 100vh;
          position: relative;
          overflow: hidden;
          padding: 0 0 80px;
        }

        /* Background glow orbs */
        .profile-glow {
          position: fixed;
          border-radius: 50%;
          filter: blur(120px);
          pointer-events: none;
          z-index: 0;
        }
        .profile-glow-1 {
          width: 600px; height: 600px;
          top: -100px; left: -200px;
          background: rgba(168, 85, 247, 0.12);
        }
        .profile-glow-2 {
          width: 500px; height: 500px;
          bottom: 0; right: -150px;
          background: rgba(236, 72, 153, 0.10);
        }
        .profile-glow-3 {
          width: 400px; height: 400px;
          top: 50%; left: 50%;
          transform: translate(-50%, -50%);
          background: rgba(59, 130, 246, 0.06);
        }

        .profile-container {
          max-width: 1100px;
          margin: 0 auto;
          padding: 40px 24px;
          position: relative;
          z-index: 1;
        }

        /*  Hero  */
        .profile-hero {
          display: flex;
          align-items: center;
          gap: 32px;
          margin-bottom: 56px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 28px;
          padding: 40px 48px;
          backdrop-filter: blur(20px);
          flex-wrap: wrap;
        }

        .profile-avatar {
          position: relative;
          flex-shrink: 0;
        }
        .profile-initials {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 96px;
          height: 96px;
          border-radius: 50%;
          background: linear-gradient(135deg, #a855f7 0%, #ec4899 100%);
          font-size: 2.2rem;
          font-weight: 800;
          color: white;
          letter-spacing: 1px;
          box-shadow: 0 0 40px rgba(168, 85, 247, 0.5);
        }
        .profile-avatar-ring {
          position: absolute;
          inset: -4px;
          border-radius: 50%;
          border: 2px solid rgba(168, 85, 247, 0.4);
          animation: ring-pulse 3s ease-in-out infinite;
        }
        @keyframes ring-pulse {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(1.05); }
        }

        .profile-identity { flex: 1; min-width: 200px; }
        .profile-name {
          font-size: 2.2rem;
          font-weight: 800;
          background: linear-gradient(135deg, #fff 0%, #d4d4d8 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          margin: 0 0 6px;
          line-height: 1.1;
        }
        .profile-email {
          color: #71717a;
          font-size: 0.9rem;
          margin: 0 0 8px;
        }
        .profile-member-since {
          color: #a855f7;
          font-size: 0.8rem;
          font-weight: 600;
          margin: 0;
        }

        .profile-fav-genre-badge {
          display: flex;
          flex-direction: column;
          align-items: center;
          background: linear-gradient(135deg, rgba(168,85,247,0.15) 0%, rgba(236,72,153,0.15) 100%);
          border: 1px solid rgba(168, 85, 247, 0.3);
          border-radius: 20px;
          padding: 20px 32px;
          text-align: center;
          backdrop-filter: blur(10px);
        }
        .fav-genre-label {
          font-size: 0.7rem;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: #a1a1aa;
          font-weight: 600;
          margin-bottom: 6px;
        }
        .fav-genre-name {
          font-size: 1.3rem;
          font-weight: 800;
          background: linear-gradient(135deg, #c084fc, #f472b6);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        /*  Stats Grid  */
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 20px;
          margin-bottom: 56px;
        }
        @media (max-width: 900px) {
          .stats-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 500px) {
          .stats-grid { grid-template-columns: 1fr; }
        }

        .stat-card {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 24px;
          padding: 28px 24px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          backdrop-filter: blur(20px);
          transition: transform 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease;
          animation: stat-fade-in 0.6s ease both;
        }
        @keyframes stat-fade-in {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .stat-card:hover {
          transform: translateY(-6px);
          border-color: rgba(168, 85, 247, 0.3);
          box-shadow: 0 20px 40px rgba(0,0,0,0.4), 0 0 0 1px rgba(168, 85, 247, 0.1);
        }

        .stat-icon-wrapper {
          width: 56px; height: 56px;
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 16px;
        }
        .gradient-green { background: linear-gradient(135deg, rgba(16,185,129,0.25), rgba(5,150,105,0.15)); }
        .gradient-pink { background: linear-gradient(135deg, rgba(236,72,153,0.25), rgba(219,39,119,0.15)); }
        .gradient-yellow { background: linear-gradient(135deg, rgba(245,158,11,0.25), rgba(217,119,6,0.15)); }
        .gradient-purple { background: linear-gradient(135deg, rgba(168,85,247,0.25), rgba(139,92,246,0.15)); }

        .stat-icon { font-size: 1.6rem; }
        .stat-value {
          font-size: 2.4rem;
          font-weight: 900;
          color: #fff;
          line-height: 1;
          margin-bottom: 8px;
          letter-spacing: -1px;
        }
        .stat-label {
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #71717a;
        }

        /*  Sections  */
        .profile-section {
          margin-bottom: 52px;
        }
        .section-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 20px;
        }
        .section-title {
          font-size: 1.4rem;
          font-weight: 700;
          color: #f4f4f5;
          margin: 0;
        }
        .section-subtitle {
          font-size: 1.1rem;
          font-weight: 700;
          color: #f4f4f5;
          margin: 0 0 20px;
        }
        .section-link {
          font-size: 0.8rem;
          font-weight: 600;
          color: #a855f7;
          text-decoration: none;
          transition: color 0.2s;
        }
        .section-link:hover { color: #c084fc; }

        /*  Mini Movie Grid  */
        .mini-movie-grid {
          display: grid;
          grid-template-columns: repeat(6, 1fr);
          gap: 14px;
        }
        @media (max-width: 900px) { .mini-movie-grid { grid-template-columns: repeat(3, 1fr); } }
        @media (max-width: 500px) { .mini-movie-grid { grid-template-columns: repeat(2, 1fr); } }

        .mini-movie-card {
          position: relative;
          border-radius: 16px;
          overflow: hidden;
          aspect-ratio: 2/3;
          display: block;
          transition: transform 0.3s ease, box-shadow 0.3s ease;
          border: 1px solid rgba(255,255,255,0.06);
        }
        .mini-movie-card:hover {
          transform: scale(1.05);
          box-shadow: 0 16px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(168,85,247,0.3);
        }
        .mini-movie-poster {
          width: 100%; height: 100%;
          object-fit: cover;
          display: block;
        }
        .mini-movie-placeholder {
          width: 100%; height: 100%;
          background: #18181b;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 2rem;
        }
        .mini-movie-overlay {
          position: absolute;
          bottom: 0; left: 0; right: 0;
          background: linear-gradient(to top, rgba(0,0,0,0.9) 0%, transparent 100%);
          padding: 20px 8px 8px;
          opacity: 0;
          transition: opacity 0.3s ease;
        }
        .mini-movie-card:hover .mini-movie-overlay { opacity: 1; }
        .mini-movie-title {
          font-size: 0.65rem;
          font-weight: 600;
          color: #fff;
          text-align: center;
          line-height: 1.3;
          margin: 0;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .mini-grid-empty {
          padding: 40px;
          text-align: center;
          background: rgba(255,255,255,0.02);
          border: 1px dashed rgba(255,255,255,0.08);
          border-radius: 20px;
          color: #52525b;
        }
        .mini-empty-icon { font-size: 2rem; display: block; margin-bottom: 8px; }

        /*  Genre Breakdown  */
        .genre-breakdown {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 24px;
          padding: 32px;
          backdrop-filter: blur(20px);
        }
        .genre-bars { display: flex; flex-direction: column; gap: 14px; }
        .genre-bar-row {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .genre-bar-label {
          min-width: 90px;
          font-size: 0.78rem;
          font-weight: 600;
          color: #a1a1aa;
          text-align: right;
        }
        .genre-bar-track {
          flex: 1;
          height: 10px;
          background: rgba(255,255,255,0.05);
          border-radius: 10px;
          overflow: hidden;
        }
        .genre-bar-fill {
          height: 100%;
          border-radius: 10px;
          animation: bar-grow 0.8s ease both;
          min-width: 4px;
        }
        @keyframes bar-grow {
          from { width: 0 !important; }
        }
        .genre-bar-count {
          min-width: 24px;
          font-size: 0.75rem;
          font-weight: 700;
          color: #71717a;
          text-align: left;
        }

        /*  Unauthenticated  */
        .profile-unauthenticated {
          min-height: 80vh;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          overflow: hidden;
        }
        .unauth-glow {
          position: absolute;
          border-radius: 50%;
          filter: blur(120px);
          pointer-events: none;
        }
        .unauth-glow-1 {
          width: 500px; height: 500px;
          top: 0; left: 0;
          background: rgba(168,85,247,0.12);
        }
        .unauth-glow-2 {
          width: 400px; height: 400px;
          bottom: 0; right: 0;
          background: rgba(236,72,153,0.10);
        }
        .unauth-card {
          max-width: 440px;
          width: 100%;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 32px;
          padding: 60px 48px;
          text-align: center;
          backdrop-filter: blur(24px);
          position: relative;
          z-index: 1;
        }
        .unauth-icon { font-size: 3.5rem; margin-bottom: 20px; display: block; }
        .unauth-title {
          font-size: 1.8rem;
          font-weight: 800;
          background: linear-gradient(135deg, #fff, #d4d4d8);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          margin: 0 0 12px;
        }
        .unauth-desc {
          color: #71717a;
          font-size: 0.9rem;
          line-height: 1.6;
          margin: 0 0 32px;
        }
        .unauth-cta {
          display: inline-block;
          background: linear-gradient(135deg, #a855f7, #ec4899);
          color: #fff;
          font-size: 0.9rem;
          font-weight: 700;
          padding: 14px 32px;
          border-radius: 16px;
          text-decoration: none;
          transition: opacity 0.2s, transform 0.2s;
          box-shadow: 0 8px 24px rgba(168, 85, 247, 0.35);
        }
        .unauth-cta:hover { opacity: 0.9; transform: translateY(-2px); }

        /*  Loading  */
        .profile-loading {
          min-height: 60vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 16px;
          color: #71717a;
          font-size: 0.9rem;
        }
        .profile-spinner {
          width: 48px; height: 48px;
          border: 3px solid rgba(168,85,247,0.2);
          border-top-color: #a855f7;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

export default Profile;
