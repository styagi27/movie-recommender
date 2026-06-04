import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import Home from './pages/Home';
import MovieDetail from './pages/MovieDetail';
import Watchlist from './pages/Watchlist';
import Profile from './pages/Profile';
import Auth from './pages/Auth';
import { supabase } from './supabaseClient';

function App() {
  const [session, setSession] = useState(null);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <Router>
      <div className="min-h-screen bg-zinc-950 text-white">
        {/* Top Navbar */}
        <nav className="fixed top-0 left-0 right-0 z-50 bg-black/95 backdrop-blur-xl border-b border-white/10">
          <div className="max-w-7xl mx-auto px-8 py-5 flex items-center justify-between">
            
            {/* Logo + Tagline */}
            <Link to="/" className="flex items-center gap-3 hover:opacity-90 transition-opacity">
              <span className="text-4xl">🎬</span>
              <div>
                <h1 className="text-3xl font-bold tracking-tighter">CineMatch</h1>
                <p className="text-purple-400 text-sm">Find Your Next Obsession</p>
              </div>
            </Link>

            <div className="flex items-center gap-6">
              <Link to="/watchlist" className="hover:text-purple-400 transition-colors text-sm font-medium">❤️ Watchlist</Link>
              <Link to="/watched" className="hover:text-purple-400 transition-colors text-sm font-medium">👁️ Watched</Link>
              <Link to="/favorites" className="hover:text-purple-400 transition-colors text-sm font-medium">⭐ Favorites</Link>
              
              {session ? (
                <div className="flex items-center gap-4 border-l border-white/10 pl-6">
                  <Link to="/profile" className="text-right hover:opacity-80 transition-opacity group">
                    <p className="text-xs text-gray-400 group-hover:text-gray-300 transition-colors">Signed in as</p>
                    <p className="text-sm font-semibold text-purple-400 group-hover:text-purple-300 max-w-[150px] truncate transition-colors" title={session.user.email}>
                      {session.user.user_metadata?.full_name || session.user.email.split('@')[0]}
                    </p>
                  </Link>
                  <Link
                    to="/profile"
                    className="bg-zinc-800 hover:bg-purple-600/20 hover:border-purple-500/40 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-all border border-white/5 active:scale-[0.98]"
                  >
                    👤 Profile
                  </Link>
                  <button 
                    onClick={handleLogout}
                    className="bg-zinc-800 hover:bg-zinc-700 hover:text-red-400 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-all border border-white/5 active:scale-[0.98]"
                  >
                    Log Out
                  </button>
                </div>
              ) : (
                <Link 
                  to="/auth" 
                  className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white text-xs font-bold px-5 py-2.5 rounded-xl transition-all shadow-lg hover:shadow-purple-500/20 active:scale-[0.98]"
                >
                  Sign In
                </Link>
              )}
            </div>
          </div>
        </nav>

        <div className="pt-28">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/movie/:id" element={<MovieDetail />} />
            <Route path="/watchlist" element={<Watchlist listType="watchlist" />} />
            <Route path="/watched" element={<Watchlist listType="watched" />} />
            <Route path="/favorites" element={<Watchlist listType="favorites" />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/auth" element={<Auth />} />
          </Routes>
        </div>
      </div>
    </Router>
  );
}

export default App;