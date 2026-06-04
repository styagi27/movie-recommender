import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../supabaseClient';

function Home() {
  const [movies, setMovies] = useState([]);
  const [carouselMovies, setCarouselMovies] = useState([]);
  const [activeCategory, setActiveCategory] = useState('popular');
  const [carouselLoading, setCarouselLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const resultsRef = useRef(null);
  const [surpriseMovies, setSurpriseMovies] = useState([]);
  const [showSurpriseModal, setShowSurpriseModal] = useState(false);
  const [surpriseLoading, setSurpriseLoading] = useState(false);

  const [showAdviceModal, setShowAdviceModal] = useState(false);
  const [adviceQuery, setAdviceQuery] = useState('');
  const [adviceMovies, setAdviceMovies] = useState([]);
  const [adviceLoading, setAdviceLoading] = useState(false);
  const [adviceError, setAdviceError] = useState('');

  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const [watchlist, setWatchlist] = useState([]);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef(null);
  const [isHovered, setIsHovered] = useState(false);
  const [session, setSession] = useState(null);
  const debounceRef = useRef(null);
  const searchContainerRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();

  const scrollToResults = () => {
    if (resultsRef.current) {
      resultsRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  useEffect(() => {
    if (searchQuery) {
      const timer = setTimeout(() => {
        scrollToResults();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [movies, searchQuery]);
  // Auto-scroll loop for Trending Now carousel
  useEffect(() => {
    const container = scrollRef.current;
    if (!container || carouselMovies.length === 0) return;

    let animationFrameId;
    const scrollSpeed = 0.8;

    const scroll = () => {
      if (!isHovered) {
        container.scrollLeft += scrollSpeed;
        if (container.scrollLeft >= container.scrollWidth / 2) {
          container.scrollLeft = 0;
        }
      }
      animationFrameId = requestAnimationFrame(scroll);
    };

    animationFrameId = requestAnimationFrame(scroll);
    return () => cancelAnimationFrame(animationFrameId);
  }, [isHovered, carouselMovies]);

  // Click outside closes suggestions
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
        setShowSuggestions(false);
        setActiveSuggestion(-1);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Load session and watchlist from Supabase
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      fetchWatchlistStatus(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      fetchWatchlistStatus(session);
    });

    return () => subscription?.unsubscribe();
  }, []);

  const fetchWatchlistStatus = async (currentSession) => {
    if (currentSession?.user) {
      try {
        const { data, error } = await supabase
          .from('watchlist')
          .select('*')
          .eq('user_id', currentSession.user.id)
          .eq('list_type', 'watchlist');
        if (error) throw error;
        const formatted = data.map(item => ({
          id: item.movie_id,
          title: item.title,
          poster_path: item.poster_path
        }));
        setWatchlist(formatted);
      } catch (err) {
        console.error('Error fetching watchlist from Supabase:', err);
      }
    } else {
      const saved = JSON.parse(localStorage.getItem('cinematch-watchlist') || '[]');
      setWatchlist(saved);
    }
  };

  useEffect(() => {
    if (location.state && location.state.genre) {
      const selectedGenre = location.state.genre;
      setSearch(selectedGenre);
      setSearchQuery(selectedGenre);
      setLoading(true);
      axios.get(`http://localhost:8000/api/movies/search?q=${encodeURIComponent(selectedGenre)}&type=genre`)
        .then(res => setMovies(Array.isArray(res.data) ? res.data : []))
        .catch(() => setMovies([]))
        .finally(() => setLoading(false));
      
      // Clear routing state so refresh doesn't preserve search state
      navigate(location.pathname, { replace: true, state: {} });
    } else {
      axios.get('http://localhost:8000/api/movies')
        .then(res => setMovies(Array.isArray(res.data) ? res.data : []))
        .catch(() => setMovies([]))
        .finally(() => setLoading(false));
    }
  }, [location.state, location.pathname, navigate]);

  useEffect(() => {
    setCarouselLoading(true);
    axios.get(`http://localhost:8000/api/movies/${activeCategory}`)
      .then(res => {
        let data = [];
        if (Array.isArray(res.data)) data = res.data;
        else if (res.data && Array.isArray(res.data.results)) data = res.data.results;
        setCarouselMovies(data);
        if (scrollRef.current) {
          scrollRef.current.scrollLeft = 0;
        }
      })
      .catch(() => setCarouselMovies([]))
      .finally(() => setCarouselLoading(false));
  }, [activeCategory]);

  // Debounced autocomplete
  const handleSearchInput = (value) => {
    setSearch(value);
    setActiveSuggestion(-1);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (value.trim().length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await axios.get(
          `http://localhost:8000/api/movies/autocomplete?q=${encodeURIComponent(value.trim())}`
        );
        const data = Array.isArray(res.data) ? res.data : [];
        setSuggestions(data);
        setShowSuggestions(data.length > 0);
      } catch (e) {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    }, 280);
  };

  const handleSuggestionClick = (suggestion) => {
    setShowSuggestions(false);
    setSuggestions([]);
    setActiveSuggestion(-1);

    if (suggestion.type === 'person') {
      setSearch(suggestion.title);
      doSearch(suggestion.title);
    } else {
      navigate(`/movie/${suggestion.id}`);
    }
  };

  const handleKeyDown = (e) => {
    if (!showSuggestions || suggestions.length === 0) {
      if (e.key === 'Enter') handleSearch();
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveSuggestion(prev => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveSuggestion(prev => Math.max(prev - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeSuggestion >= 0) {
        handleSuggestionClick(suggestions[activeSuggestion]);
      } else {
        setShowSuggestions(false);
        handleSearch();
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
      setActiveSuggestion(-1);
    }
  };

  const doSearch = (q) => {
    const query = q !== undefined ? q : search;
    if (!query.trim()) return;
    setSearchQuery(query.trim());
    axios.get(`http://localhost:8000/api/movies/search?q=${encodeURIComponent(query.trim())}&type=all`)
      .then(res => setMovies(Array.isArray(res.data) ? res.data : []))
      .catch(() => setMovies([]));
  };

  const handleSearch = () => {
    setShowSuggestions(false);
    doSearch();
  };

  const handleSurpriseMe = () => {
    setSurpriseLoading(true);
    setShowSurpriseModal(true);
    axios.get('http://localhost:8000/api/movies/surprise')
      .then(res => {
        setSurpriseMovies(Array.isArray(res.data) ? res.data : []);
      })
      .catch(() => setSurpriseMovies([]))
      .finally(() => setSurpriseLoading(false));
  };

  const handleCineAdvice = () => {
    const q = adviceQuery.trim();
    if (!q) return;
    setAdviceLoading(true);
    setAdviceError('');
    setAdviceMovies([]);
    axios.get(`http://localhost:8000/api/movies/advice?q=${encodeURIComponent(q)}`)
      .then(res => {
        const data = Array.isArray(res.data) ? res.data : [];
        if (data.length === 0) setAdviceError('No results found. Try a different query!');
        else setAdviceMovies(data);
      })
      .catch(err => {
        if (err.response && err.response.data && err.response.data.error === 'non_movie_query') {
          setAdviceError(err.response.data.message || 'CineAdvice only works for movie-related queries 🎬');
        } else {
          setAdviceError('Something went wrong. Please try again.');
        }
      })
      .finally(() => setAdviceLoading(false));
  };

  const toggleWatchlist = async (movie) => {
    const movieIdStr = String(movie.id);
    const isInWatchlist = watchlist.some(m => String(m.id) === movieIdStr);

    if (session?.user) {
      try {
        if (isInWatchlist) {
          const { error } = await supabase.from('watchlist').delete()
            .eq('user_id', session.user.id).eq('movie_id', movieIdStr).eq('list_type', 'watchlist');
          if (error) throw error;
          setWatchlist(prev => prev.filter(m => String(m.id) !== movieIdStr));
        } else {
          const { error } = await supabase.from('watchlist').insert({
            user_id: session.user.id, movie_id: movieIdStr,
            title: movie.title, poster_path: movie.poster_path, list_type: 'watchlist'
          });
          if (error) throw error;
          setWatchlist(prev => [...prev, { id: movieIdStr, title: movie.title, poster_path: movie.poster_path }]);
        }
      } catch (err) {
        console.error('Error toggling watchlist item on Supabase:', err);
      }
    } else {
      let updated = isInWatchlist
        ? watchlist.filter(m => String(m.id) !== movieIdStr)
        : [...watchlist, movie];
      setWatchlist(updated);
      localStorage.setItem('cinematch-watchlist', JSON.stringify(updated));
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="max-w-5xl mx-auto mb-16 mt-4">
        <div className="relative" ref={searchContainerRef}>
          <div className="flex flex-col md:flex-row items-center gap-4">
            <div className="flex-1 w-full relative">
              <input
                id="movie-search-input"
                type="text"
                placeholder="Search movies, actors, genres..."
                value={search}
                onChange={(e) => handleSearchInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                className="w-full bg-zinc-900/50 backdrop-blur-xl border border-white/10 focus:border-purple-500/80 rounded-full px-6 py-3 text-base outline-none transition-all shadow-xl placeholder:text-zinc-500"
              />

              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-zinc-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl shadow-black/60 z-50 overflow-hidden">
                  {suggestions.map((s, idx) => (
                    <button
                      key={`${s.type}-${s.id}-${idx}`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleSuggestionClick(s)}
                      className={`w-full flex items-center gap-4 px-5 py-3 text-left transition-colors ${
                        idx === activeSuggestion
                          ? 'bg-purple-600/30 text-white'
                          : 'hover:bg-white/5 text-zinc-200'
                      }`}
                    >
                      <div className="flex-shrink-0 w-9 h-13 rounded-lg overflow-hidden bg-zinc-800" style={{width:'36px',height:'52px'}}>
                        {s.poster_path ? (
                          <img src={`https://image.tmdb.org/t/p/w92${s.poster_path}`} alt={s.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-lg">{s.type === 'person' ? '🎭' : '🎬'}</div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold truncate">{s.title}</div>
                        <div className="text-xs text-zinc-400 mt-0.5">
                          {s.type === 'person' ? <span className="text-pink-400">🎭 {s.subtitle || 'Actor / Director'}</span> : <span>{s.subtitle}</span>}
                        </div>
                      </div>
                      <div className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-full ${s.type === 'person' ? 'bg-pink-500/20 text-pink-300' : 'bg-purple-500/20 text-purple-300'}`}>
                        {s.type === 'person' ? 'Actor' : 'Movie'}
                      </div>
                    </button>
                  ))}
                  <div className="px-5 py-2 border-t border-white/5 text-xs text-zinc-500 flex items-center gap-2">
                    <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-[10px]">↵</kbd> Press Enter to search all · <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-[10px]">↑↓</kbd> Navigate
                  </div>
                </div>
              )}
            </div>
            <div className="flex flex-wrap md:flex-nowrap gap-3 w-full md:w-auto justify-center">
              <button
                onClick={handleSearch}
                className="flex-1 md:flex-initial bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white px-6 py-3 rounded-full font-bold text-sm tracking-wide shadow-lg hover:shadow-purple-500/20 active:scale-95 transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer white-space-nowrap"
              >
                Search
              </button>
              <button
                onClick={handleSurpriseMe}
                className="flex-1 md:flex-initial bg-zinc-900/80 hover:bg-zinc-800 text-white border border-white/10 hover:border-purple-500/50 px-6 py-3 rounded-full font-bold text-sm tracking-wide shadow-lg active:scale-95 transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer white-space-nowrap"
              >
                🎲 Surprise Me
              </button>
              <button
                onClick={() => { setShowAdviceModal(true); setAdviceMovies([]); setAdviceError(''); }}
                className="flex-1 md:flex-initial bg-gradient-to-r from-cyan-600/80 to-indigo-600/80 hover:from-cyan-500 hover:to-indigo-500 text-white border border-cyan-500/30 px-6 py-3 rounded-full font-bold text-sm tracking-wide shadow-lg shadow-cyan-500/10 active:scale-95 transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer white-space-nowrap"
              >
                ✨ CineAdvice
              </button>
            </div>
          </div>
        </div>
      </div>


      <div className="mb-16">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 border-b border-white/5 pb-5">
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setActiveCategory('popular')}
              className={`px-6 py-3 rounded-full font-bold text-sm tracking-wide transition-all duration-300 active:scale-95 flex items-center gap-2 ${
                activeCategory === 'popular'
                  ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg shadow-purple-500/20'
                  : 'bg-zinc-900/60 hover:bg-zinc-800 text-zinc-400 border border-white/5 hover:border-white/10 hover:text-white'
              }`}
            >
              🔥 Trending
            </button>
            <button
              onClick={() => setActiveCategory('top_rated')}
              className={`px-6 py-3 rounded-full font-bold text-sm tracking-wide transition-all duration-300 active:scale-95 flex items-center gap-2 ${
                activeCategory === 'top_rated'
                  ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg shadow-purple-500/20'
                  : 'bg-zinc-900/60 hover:bg-zinc-800 text-zinc-400 border border-white/5 hover:border-white/10 hover:text-white'
              }`}
            >
              ⭐ Top Rated
            </button>
            <button
              onClick={() => setActiveCategory('now_playing')}
              className={`px-6 py-3 rounded-full font-bold text-sm tracking-wide transition-all duration-300 active:scale-95 flex items-center gap-2 ${
                activeCategory === 'now_playing'
                  ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg shadow-purple-500/20'
                  : 'bg-zinc-900/60 hover:bg-zinc-800 text-zinc-400 border border-white/5 hover:border-white/10 hover:text-white'
              }`}
            >
              🎬 Now Playing
            </button>
            <button
              onClick={() => setActiveCategory('upcoming')}
              className={`px-6 py-3 rounded-full font-bold text-sm tracking-wide transition-all duration-300 active:scale-95 flex items-center gap-2 ${
                activeCategory === 'upcoming'
                  ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg shadow-purple-500/20'
                  : 'bg-zinc-900/60 hover:bg-zinc-800 text-zinc-400 border border-white/5 hover:border-white/10 hover:text-white'
              }`}
            >
              📅 Upcoming
            </button>
          </div>
        </div>

        {carouselLoading ? (
          <div className="flex items-center justify-center h-80 bg-zinc-900/10 rounded-3xl border border-white/5">
            <div className="flex flex-col items-center gap-3">
              <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-purple-500"></div>
              <span className="text-zinc-500 text-sm font-medium">Loading movies...</span>
            </div>
          </div>
        ) : (
          <div ref={scrollRef} onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)} className="flex gap-4 overflow-x-auto pb-8 scrollbar-hide scroll-smooth">
            {(carouselMovies || []).length > 0 ? (
              [...carouselMovies, ...carouselMovies].map((movie, index) => {
                const isInWatchlist = watchlist.some(m => String(m.id) === String(movie.id));
                return (
                  <div key={`${movie.id}-${index}`} className="flex-shrink-0 w-52 group relative">
                    <Link to={`/movie/${movie.id}`}>
                      <div className="relative rounded-3xl overflow-hidden shadow-xl aspect-[2/3] group-hover:scale-105 transition-transform duration-300">
                        {movie.poster_path ? <img src={`https://image.tmdb.org/t/p/w500${movie.poster_path}`} alt={movie.title} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-zinc-900 flex items-center justify-center text-6xl">🎥</div>}
                        <div className="absolute top-4 right-4 bg-black/70 px-3 py-1 rounded-full text-sm backdrop-blur-sm z-10">⭐ {movie.vote_average?.toFixed(1)}</div>
                      </div>
                    </Link>
                    <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleWatchlist(movie); }} className="absolute top-4 left-4 text-3xl transition-transform hover:scale-125 z-50 cursor-pointer">
                      {isInWatchlist ? '❤️' : '♡'}
                    </button>
                  </div>
                );
              })
            ) : <div className="text-gray-500 px-4 py-12">No movies found.</div>}
          </div>
        )}
      </div>

      <div ref={resultsRef} className="scroll-mt-24">
        {searchQuery && (
          <div className="mb-8 flex justify-between items-center bg-zinc-900/30 border border-white/5 rounded-3xl p-6 backdrop-blur-md">
            <h3 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
              🔍 Showing results for <span className="text-purple-400">"{searchQuery}"</span>
            </h3>
            <button
              onClick={() => {
                setSearch('');
                setSearchQuery('');
                setLoading(true);
                axios.get('http://localhost:8000/api/movies')
                  .then(res => setMovies(Array.isArray(res.data) ? res.data : []))
                  .catch(() => setMovies([]))
                  .finally(() => setLoading(false));
              }}
              className="text-xs font-bold uppercase tracking-wider bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white px-5 py-2.5 rounded-xl border border-white/5 transition-all cursor-pointer active:scale-95 shadow-md"
            >
              Clear Results
            </button>
          </div>
        )}

        {loading ? (
          <div className="text-center py-32 text-3xl text-gray-500">Loading movies...</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-8">
            {(movies || []).length > 0 ? (
              movies.map(movie => {
                const isInWatchlist = watchlist.some(m => String(m.id) === String(movie.id));
                return (
                  <div key={movie.id} className="group relative">
                    <Link to={`/movie/${movie.id}`} className="block rounded-3xl overflow-hidden shadow-2xl hover:shadow-purple-500/30 transition-all hover:-translate-y-2">
                      <div className="aspect-[2/3] relative bg-zinc-900">
                        {movie.poster_path ? <img src={`https://image.tmdb.org/t/p/w500${movie.poster_path}`} alt={movie.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" /> : <div className="w-full h-full flex items-center justify-center text-8xl opacity-50">🎥</div>}
                        <div className="absolute top-4 right-4 bg-black/70 px-3 py-1 rounded-full text-sm backdrop-blur-sm z-10">⭐ {Number(movie.vote_average).toFixed(1)}</div>
                      </div>
                      <div className="p-5 bg-zinc-900"><h3 className="font-semibold text-lg line-clamp-2 group-hover:text-purple-400 transition-colors">{movie.title}</h3></div>
                    </Link>
                    <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleWatchlist(movie); }} className="absolute top-4 left-4 text-3xl transition-transform hover:scale-125 z-50 cursor-pointer">
                      {isInWatchlist ? '❤️' : '♡'}
                    </button>
                  </div>
                );
              })
            ) : (
              <div className="col-span-full text-center text-gray-500 py-12">No movies found. Try a different search or filter.</div>
            )}
          </div>
        )}
      </div>

      {showSurpriseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="bg-zinc-950 border border-white/10 rounded-3xl max-w-4xl w-full p-8 shadow-2xl relative overflow-hidden">
            {/* Ambient background glow */}
            <div className="absolute -top-40 -left-40 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none"></div>
            <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-pink-500/10 rounded-full blur-3xl pointer-events-none"></div>

            <div className="flex justify-between items-center mb-6">
              <h2 className="text-3xl font-bold flex items-center gap-2 text-zinc-100">
                🎲 Your Surprise Recommendations
              </h2>
              <button
                onClick={() => setShowSurpriseModal(false)}
                className="text-zinc-400 hover:text-white bg-zinc-900 hover:bg-zinc-800 rounded-full w-10 h-10 flex items-center justify-center border border-white/5 cursor-pointer transition-colors"
              >
                ✕
              </button>
            </div>

            {surpriseLoading ? (
              <div className="h-80 flex flex-col items-center justify-center gap-4">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500"></div>
                <span className="text-zinc-500 text-sm font-medium animate-pulse">Shuffling the deck...</span>
              </div>
            ) : (
              <div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                  {surpriseMovies.map(movie => (
                    <div key={movie.id} className="bg-zinc-900/40 border border-white/5 hover:border-purple-500/30 rounded-2xl p-4 flex flex-col transition-all hover:scale-[1.02] hover:bg-zinc-900/60 group">
                      <Link to={`/movie/${movie.id}`} onClick={() => setShowSurpriseModal(false)} className="block aspect-[2/3] rounded-xl overflow-hidden mb-4 shadow-md">
                        {movie.poster_path ? (
                          <img
                            src={`https://image.tmdb.org/t/p/w342${movie.poster_path}`}
                            alt={movie.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-350"
                          />
                        ) : (
                          <div className="w-full h-full bg-zinc-800 flex items-center justify-center text-5xl">🎥</div>
                        )}
                      </Link>
                      <Link 
                        to={`/movie/${movie.id}`} 
                        onClick={() => setShowSurpriseModal(false)} 
                        className="font-bold text-lg text-zinc-100 hover:text-purple-400 transition-colors line-clamp-2 mt-auto"
                      >
                        {movie.title}
                      </Link>
                      <div className="flex items-center justify-between mt-2 text-sm text-zinc-400">
                        <span>⭐ {movie.vote_average?.toFixed(1) || 'N/A'}</span>
                        {movie.release_date && (
                          <span>{movie.release_date.split('-')[0]}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-end gap-4 border-t border-white/5 pt-6">
                  <button
                    onClick={handleSurpriseMe}
                    className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white px-6 py-3 rounded-2xl font-semibold shadow-lg hover:shadow-purple-500/20 active:scale-[0.98] transition-all flex items-center gap-2 cursor-pointer"
                  >
                    🎲 Roll Again
                  </button>
                  <button
                    onClick={() => setShowSurpriseModal(false)}
                    className="bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white px-6 py-3 rounded-2xl font-semibold border border-white/5 transition-all cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CineAdvice Modal */}
      {showAdviceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4" onClick={(e) => { if (e.target === e.currentTarget) setShowAdviceModal(false); }}>
          <div className="bg-zinc-950 border border-white/10 rounded-3xl max-w-4xl w-full p-8 shadow-2xl relative overflow-hidden">
            {/* Ambient glows */}
            <div className="absolute -top-40 -left-40 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"></div>
            <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>

            <div className="flex justify-between items-center mb-2">
              <div>
                <h2 className="text-3xl font-bold flex items-center gap-3 text-zinc-100">
                  <span className="text-4xl">✨</span>
                  <span className="bg-gradient-to-r from-cyan-400 to-indigo-400 bg-clip-text text-transparent">CineAdvice</span>
                </h2>
                <p className="text-zinc-400 text-sm mt-1 ml-14">Describe what you want to watch in plain English</p>
              </div>
              <button
                onClick={() => setShowAdviceModal(false)}
                className="text-zinc-400 hover:text-white bg-zinc-900 hover:bg-zinc-800 rounded-full w-10 h-10 flex items-center justify-center border border-white/5 cursor-pointer transition-colors flex-shrink-0"
              >
                ✕
              </button>
            </div>

            {/* Query examples */}
            <div className="flex flex-wrap gap-2 mt-5 mb-5">
              {[
                '🕵️ Sci-fi thriller with Tom Hanks',
                '💕 Romantic movie of Scarlett Johansson',
                '💥 Action film of Tom Cruise',
                '😂 Comedy starring Will Smith',
              ].map(ex => (
                <button
                  key={ex}
                  onClick={() => setAdviceQuery(ex.replace(/^[^\w]+/, '').trim())}
                  className="text-xs px-3 py-1.5 rounded-full border border-white/10 bg-white/5 hover:bg-cyan-500/20 hover:border-cyan-500/40 text-zinc-300 hover:text-cyan-300 transition-all cursor-pointer"
                >
                  {ex}
                </button>
              ))}
            </div>

            {/* Input row */}
            <div className="flex gap-3 mb-6">
              <input
                id="cineadvice-input"
                type="text"
                value={adviceQuery}
                onChange={e => setAdviceQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCineAdvice()}
                placeholder="e.g. Suggest me a romantic Tom Cruise movie..."
                className="flex-1 bg-zinc-900/70 backdrop-blur-xl border border-white/10 focus:border-cyan-500/70 rounded-2xl px-6 py-4 text-base outline-none transition-all placeholder:text-zinc-600 text-zinc-100"
                autoFocus
              />
              <button
                onClick={handleCineAdvice}
                disabled={adviceLoading || !adviceQuery.trim()}
                className="bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-7 py-4 rounded-2xl font-semibold shadow-lg transition-all active:scale-[0.97] flex items-center gap-2 cursor-pointer"
              >
                {adviceLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
                    <span>Finding...</span>
                  </>
                ) : (
                  <><span>✨</span><span>Advise Me</span></>
                )}
              </button>
            </div>

            {/* Results */}
            {adviceLoading && (
              <div className="h-64 flex flex-col items-center justify-center gap-4">
                <div className="relative">
                  <div className="animate-spin rounded-full h-14 w-14 border-t-2 border-b-2 border-cyan-500"></div>
                  <div className="absolute inset-0 animate-ping rounded-full h-14 w-14 border border-cyan-500/20"></div>
                </div>
                <span className="text-zinc-500 text-sm font-medium animate-pulse">Curating your perfect picks...</span>
              </div>
            )}

            {!adviceLoading && adviceError && (
              <div className="h-40 flex flex-col items-center justify-center gap-3 text-center">
                <span className="text-5xl">🎬</span>
                <p className="text-zinc-400">{adviceError}</p>
                <p className="text-zinc-600 text-sm">Try something like "romantic movie of Tom Hanks"</p>
              </div>
            )}

            {!adviceLoading && adviceMovies.length > 0 && (
              <div>
                <p className="text-zinc-500 text-xs uppercase tracking-widest mb-4">Top 3 Picks for you</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {adviceMovies.map(movie => (
                    <div key={movie.id} className="bg-zinc-900/40 border border-white/5 hover:border-cyan-500/30 rounded-2xl p-4 flex flex-col transition-all hover:scale-[1.02] hover:bg-zinc-900/60 group">
                      <Link
                        to={`/movie/${movie.id}`}
                        onClick={() => setShowAdviceModal(false)}
                        className="block aspect-[2/3] rounded-xl overflow-hidden mb-4 shadow-md"
                      >
                        {movie.poster_path ? (
                          <img
                            src={`https://image.tmdb.org/t/p/w342${movie.poster_path}`}
                            alt={movie.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full bg-zinc-800 flex items-center justify-center text-5xl">🎥</div>
                        )}
                      </Link>
                      <Link
                        to={`/movie/${movie.id}`}
                        onClick={() => setShowAdviceModal(false)}
                        className="font-bold text-lg text-zinc-100 hover:text-cyan-400 transition-colors line-clamp-2 mt-auto"
                      >
                        {movie.title}
                      </Link>
                      <div className="flex items-center justify-between mt-2 text-sm text-zinc-400">
                        <span>⭐ {Number(movie.vote_average).toFixed(1) || 'N/A'}</span>
                        {movie.release_date && (
                          <span>{movie.release_date.split('-')[0]}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex justify-end gap-4 border-t border-white/5 pt-6 mt-6">
                  <button
                    onClick={handleCineAdvice}
                    className="bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white px-6 py-3 rounded-2xl font-semibold shadow-lg transition-all flex items-center gap-2 cursor-pointer active:scale-[0.98]"
                  >
                    ✨ Refine Results
                  </button>
                  <button
                    onClick={() => setShowAdviceModal(false)}
                    className="bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white px-6 py-3 rounded-2xl font-semibold border border-white/5 transition-all cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default Home;