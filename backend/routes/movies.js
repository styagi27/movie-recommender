const express = require('express');
const router = express.Router();
const { movies } = require('../data/movies');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

async function enrichPoster(movie) {
  if (!movie || (movie.poster_path && movie.poster_path.startsWith('/'))) return movie;
  if (!TMDB_API_KEY) return movie;
  try {
    const res = await axios.get(`https://api.themoviedb.org/3/movie/${movie.id}?api_key=${TMDB_API_KEY}`);
    if (res.data.poster_path) movie.poster_path = res.data.poster_path;
  } catch (e) { }
  return movie;
}

// Home - Regular Movies
router.get('/', async (req, res) => {
  let list = movies.slice(0, 50);
  for (let m of list) await enrichPoster(m);
  res.json(list);
});

// Autocomplete — fast suggestions via TMDB search/multi + local title prefix
router.get('/autocomplete', async (req, res) => {
  const query = (req.query.q || '').trim();
  if (!query || query.length < 2) return res.json([]);

  const suggestions = [];

  // Parse genres JSON string → first genre name
  // The CSV stores JSON with doubled quotes (CSV escaping): [{""id"": 12, ""name"": ""Adventure""}]
  // We must unescape "" → " before JSON.parse
  const parseFirstGenre = (genresStr) => {
    if (!genresStr) return '';
    try {
      const unescaped = genresStr.replace(/""/g, '"');
      const parsed = JSON.parse(unescaped);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed[0].name || '';
    } catch (e) { }
    return '';
  };


  // Local title prefix matches (instant, no API call)
  const lq = query.toLowerCase();
  const localMatches = movies
    .filter(m => m.title.toLowerCase().startsWith(lq))
    .slice(0, 5)
    .map(m => ({
      id: m.id,
      title: m.title,
      type: 'movie',
      poster_path: m.poster_path,
      subtitle: parseFirstGenre(m.genres)
    }));
  suggestions.push(...localMatches);

  // TMDB search/multi for richer results (movies + people)
  if (TMDB_API_KEY) {
    try {
      const tmdbRes = await axios.get(
        `https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&page=1`
      );
      const tmdbResults = (tmdbRes.data.results || [])
        .filter(r => r.media_type === 'movie' || r.media_type === 'person')
        .slice(0, 8);

      for (const r of tmdbResults) {
        const isMovie = r.media_type === 'movie';
        const id = r.id;
        // Avoid dupes with local matches
        if (isMovie && suggestions.some(s => s.id === id && s.type === 'movie')) continue;
        suggestions.push({
          id,
          title: isMovie ? r.title : r.name,
          type: isMovie ? 'movie' : 'person',
          poster_path: isMovie ? r.poster_path : r.profile_path,
          subtitle: isMovie
            ? (r.release_date ? r.release_date.split('-')[0] : '')
            : 'Actor / Director'
        });
      }
    } catch (e) { }
  }

  res.json(suggestions.slice(0, 8));
});

// Search — supports type=all|title|actor|genre
router.get('/search', async (req, res) => {
  const query = (req.query.q || '').toLowerCase().trim();
  const type = (req.query.type || 'all').toLowerCase();

  if (!query) {
    let list = movies.slice(0, 50);
    for (let m of list) await enrichPoster(m);
    return res.json(list);
  }

  const seen = new Set();
  const results = [];

  const add = (arr) => {
    for (const m of arr) {
      if (!seen.has(m.id)) { seen.add(m.id); results.push(m); }
    }
  };

  // --- Title search (local) ---
  if (type === 'all' || type === 'title') {
    add(movies.filter(m => m.title.toLowerCase().includes(query)));
  }

  // --- Genre search (local) ---
  if (type === 'all' || type === 'genre') {
    add(movies.filter(m => m.genres && m.genres.toLowerCase().includes(query)));
  }

  // --- Actor search (local cast data + TMDB person search) ---
  if (type === 'all' || type === 'actor') {
    // Local cast field
    add(movies.filter(m => m.cast && m.cast.toLowerCase().includes(query)));

    // TMDB person search → movie credits
    if (TMDB_API_KEY) {
      try {
        const personRes = await axios.get(
          `https://api.themoviedb.org/3/search/person?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&page=1`
        );
        const person = (personRes.data.results || [])[0];
        if (person) {
          const creditsRes = await axios.get(
            `https://api.themoviedb.org/3/person/${person.id}/movie_credits?api_key=${TMDB_API_KEY}`
          );
          const tmdbMovies = (creditsRes.data.cast || [])
            .sort((a, b) => b.popularity - a.popularity)
            .slice(0, 20)
            .map(m => ({
              id: m.id,
              title: m.title,
              overview: m.overview || '',
              genres: (m.genre_ids || []).join(', '),
              vote_average: m.vote_average || 0,
              poster_path: m.poster_path || null,
              cast: person.name
            }));
          add(tmdbMovies);
        }
      } catch (e) { }
    }
  }

  // Sort by rating (high-to-low)
  results.sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0));

  const final = results.slice(0, 40);
  for (let m of final) await enrichPoster(m);
  res.json(final);
});

// Popular Movies Carousel
router.get('/popular', async (req, res) => {
  console.log("Fetching popular movies...");
  try {
    if (TMDB_API_KEY) {
      const response = await axios.get(`https://api.themoviedb.org/3/movie/popular?api_key=${TMDB_API_KEY}&page=1`);
      console.log(`TMDB returned ${response.data.results.length} movies`);
      res.json(response.data.results.slice(0, 12));
      return;
    }
  } catch (e) {
    console.log("TMDB failed");
  }
  res.json(movies.slice(0, 12));
});

// Top Rated Movies Carousel
router.get('/top_rated', async (req, res) => {
  console.log("Fetching top rated movies...");
  try {
    if (TMDB_API_KEY) {
      const response = await axios.get(`https://api.themoviedb.org/3/movie/top_rated?api_key=${TMDB_API_KEY}&page=1`);
      console.log(`TMDB returned ${response.data.results.length} movies`);
      res.json(response.data.results.slice(0, 12));
      return;
    }
  } catch (e) {
    console.log("TMDB top_rated failed");
  }
  // Fallback: sort local movies by vote_average descending
  const sorted = [...movies].sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0));
  res.json(sorted.slice(0, 12));
});

// Now Playing Movies Carousel
router.get('/now_playing', async (req, res) => {
  console.log("Fetching now playing movies...");
  try {
    if (TMDB_API_KEY) {
      const response = await axios.get(`https://api.themoviedb.org/3/movie/now_playing?api_key=${TMDB_API_KEY}&page=1`);
      console.log(`TMDB returned ${response.data.results.length} movies`);
      res.json(response.data.results.slice(0, 12));
      return;
    }
  } catch (e) {
    console.log("TMDB now_playing failed");
  }
  // Fallback: subset of local movies
  res.json(movies.slice(12, 24));
});

// Upcoming Movies Carousel
router.get('/upcoming', async (req, res) => {
  console.log("Fetching upcoming movies...");
  try {
    if (TMDB_API_KEY) {
      const response = await axios.get(`https://api.themoviedb.org/3/movie/upcoming?api_key=${TMDB_API_KEY}&page=1`);
      console.log(`TMDB returned ${response.data.results.length} movies`);
      res.json(response.data.results.slice(0, 12));
      return;
    }
  } catch (e) {
    console.log("TMDB upcoming failed");
  }
  // Fallback: subset of local movies
  res.json(movies.slice(24, 36));
});

// Surprise Me - 3 random highly-rated movies
router.get('/surprise', async (req, res) => {
  console.log("Fetching surprise recommendation...");
  try {
    if (TMDB_API_KEY) {
      const page = Math.floor(Math.random() * 5) + 1; // Random page between 1 and 5
      const response = await axios.get(`https://api.themoviedb.org/3/movie/top_rated?api_key=${TMDB_API_KEY}&page=${page}`);
      const list = response.data.results || [];
      const shuffled = list.sort(() => 0.5 - Math.random());
      res.json(shuffled.slice(0, 3));
      return;
    }
  } catch (e) {
    console.log("TMDB surprise failed");
  }
  // Fallback: get local movies with vote_average >= 7.5 and shuffle
  const highlyRated = movies.filter(m => (m.vote_average || 0) >= 7.5);
  const shuffled = highlyRated.sort(() => 0.5 - Math.random());
  res.json(shuffled.slice(0, 3));
});



// CineAdvice - Natural language query recommender
const GENRE_MAP = {
  action: 28, adventure: 12, animation: 16, comedy: 35, crime: 80,
  documentary: 99, drama: 18, family: 10751, fantasy: 14, history: 36,
  horror: 27, music: 10402, mystery: 9648, romance: 10749, romantic: 10749,
  'science fiction': 878, scifi: 878, 'sci-fi': 878, thriller: 53,
  war: 10752, western: 37
};

router.get('/advice', async (req, res) => {
  const rawQuery = (req.query.q || '').trim();
  console.log(`🎬 /advice endpoint called with query: "${rawQuery}"`);
  if (!rawQuery) return res.json([]);

  let actorName = null;
  let genreName = null;
  let directorName = null;
  let keywords = null;
  let sortBy = null; // 'rating' | 'recency' | 'popularity' | null
  let theme = null;
  let isMovieRelated = true;
  let usedGemini = false;

  if (GEMINI_API_KEY) {
    try {
      console.log(`Calling Gemini API for query parsing`);
      const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

      const prompt = `You are a professional movie recommendation assistant.
Analyze the following user query: "${rawQuery}"

Determine if this query is related to movies, actors, directors, genres, plot points, or film topics. If it is NOT related to movies/cinema (for example, queries about coding, history, baking, math, general science, general conversation, or anything non-movie related), set "isMovieRelated" to false.

Respond ONLY with a JSON object conforming to the following schema:
{
  "isMovieRelated": boolean,
  "actor": "string or null representing the detected actor name",
  "genre": "string or null representing the detected genre name",
  "director": "string or null representing the detected director name",
  "keywords": "string or null representing search keywords, movie titles, plot elements, or descriptive themes",
  "sortBy": "string representing the sorting preference: 'rating' (for top rated, best, highest rated), 'recency' (for latest, new, release date, recent), 'popularity' (for popular, famous), or null if no sorting preference is specified",
  "theme": "string or null representing mood, theme, or concept (e.g. 'inspirational', 'funny', 'tear-jerker', 'mind-bending', 'time-travel')"
}
Do not include any explanation or markdown formatting. Just return the JSON object.`;

      const geminiResponse = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json"
        }
      });

      const responseText = geminiResponse.response.text().trim();
      console.log("Gemini API raw response:", responseText);

      const parsed = JSON.parse(responseText);
      isMovieRelated = parsed.isMovieRelated !== false;
      actorName = parsed.actor || null;
      genreName = parsed.genre || null;
      directorName = parsed.director || null;
      keywords = parsed.keywords || null;
      sortBy = parsed.sortBy || null;
      theme = parsed.theme || null;
      usedGemini = true;

      console.log(`Gemini Extraction: isMovieRelated=${isMovieRelated}, actor=${actorName}, genre=${genreName}, director=${directorName}, keywords=${keywords}, sortBy=${sortBy}, theme=${theme}`);

      if (!isMovieRelated) {
        console.log(`Query filtered out (not movie-related): "${rawQuery}"`);
        return res.status(400).json({
          error: "non_movie_query",
          message: "CineAdvice only works for movie-related queries 🎬"
        });
      }
    } catch (e) {
      console.error("Gemini API error, falling back to rule-based parser:", e.message);
    }
  }

  //Regex/Rule-based parser fallback
  if (!usedGemini) {
    const lower = rawQuery.toLowerCase();

    // Extract genre name
    for (const [keyword, id] of Object.entries(GENRE_MAP)) {
      if (lower.includes(keyword)) {
        genreName = keyword;
        break;
      }
    }

    // Try to extract actor name by removing common filler words and genre words
    const fillerWords = [
      'suggest', 'me', 'a', 'an', 'some', 'recommend', 'find', 'show', 'give',
      'top', 'best', 'good', 'great', 'movie', 'movies', 'film', 'films',
      'of', 'by', 'with', 'from', 'starring', 'featuring', 'about',
      ...Object.keys(GENRE_MAP)
    ];
    const words = lower.split(/\s+/).filter(w => w.length > 1 && !fillerWords.includes(w));
    actorName = words.join(' ').trim() || null;

    // Detect basic sort instruction
    if (lower.includes('top rated') || lower.includes('best') || lower.includes('highest rated')) {
      sortBy = 'rating';
    } else if (lower.includes('latest') || lower.includes('new') || lower.includes('recent')) {
      sortBy = 'recency';
    } else if (lower.includes('popular') || lower.includes('famous')) {
      sortBy = 'popularity';
    }

    console.log(`Rule-based Extraction: actor=${actorName}, genre=${genreName}, sortBy=${sortBy}`);
  }

  // Resolve genre ID from GENRE_MAP
  let detectedGenreId = null;
  if (genreName) {
    detectedGenreId = GENRE_MAP[genreName.toLowerCase()];
  }

  // Fetch results from TMDB if API key is present
  if (TMDB_API_KEY) {
    try {
      let results = [];

      // 1. Search by Person (Actor or Director)
      const personQuery = actorName || directorName;
      if (personQuery) {
        console.log(`Searching TMDB for person: "${personQuery}"`);
        const personRes = await axios.get(
          `https://api.themoviedb.org/3/search/person?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(personQuery)}&page=1`
        );
        const person = (personRes.data.results || [])[0];

        if (person) {
          console.log(`  Found person: ${person.name} (id: ${person.id})`);
          const creditsRes = await axios.get(
            `https://api.themoviedb.org/3/person/${person.id}/movie_credits?api_key=${TMDB_API_KEY}`
          );

          let creditMovies = creditsRes.data.cast || [];
          if (directorName && !actorName) {
            creditMovies = (creditsRes.data.crew || []).filter(c => c.job === 'Director');
          }

          // Filter by genre if detected
          if (detectedGenreId) {
            creditMovies = creditMovies.filter(m => (m.genre_ids || []).includes(detectedGenreId));
          }

          // Filter out obscure credits/cameos if we have enough movies to recommend
          let filteredCredits = creditMovies.filter(m => (m.vote_count || 0) >= 100);
          if (filteredCredits.length < 3) {
            filteredCredits = creditMovies.filter(m => (m.vote_count || 0) >= 50);
          }
          if (filteredCredits.length < 3) {
            filteredCredits = creditMovies.filter(m => (m.vote_count || 0) >= 10);
          }
          if (filteredCredits.length < 3) {
            filteredCredits = creditMovies;
          }
          creditMovies = filteredCredits;

          // Rank results based on relevance scoring
          const searchTerms = [];
          if (keywords && !keywords.toLowerCase().includes('movie') && !keywords.toLowerCase().includes('film')) {
            searchTerms.push(...keywords.toLowerCase().split(/\s+/));
          }
          if (theme) {
            searchTerms.push(...theme.toLowerCase().split(/\s+/));
          }

          if (searchTerms.length > 0) {
            creditMovies = creditMovies.map(m => {
              let score = 0;
              const text = `${m.title || ''} ${m.overview || ''}`.toLowerCase();
              for (const term of searchTerms) {
                if (text.includes(term)) score += 10;
              }
              m.relevanceScore = score;
              return m;
            });
            // Sort by relevance score primarily if matches exist
            if (creditMovies.some(m => m.relevanceScore > 0)) {
              creditMovies.sort((a, b) => b.relevanceScore - a.relevanceScore);
            }
          }

          // Apply sorting preference
          if (sortBy === 'rating') {
            creditMovies.sort((a, b) => {
              if (a.relevanceScore !== undefined && b.relevanceScore !== undefined && a.relevanceScore !== b.relevanceScore) {
                return b.relevanceScore - a.relevanceScore;
              }
              return (b.vote_average || 0) - (a.vote_average || 0) || (b.vote_count || 0) - (b.vote_count || 0);
            });
          } else if (sortBy === 'recency') {
            creditMovies.sort((a, b) => {
              const dateA = a.release_date ? new Date(a.release_date) : new Date(0);
              const dateB = b.release_date ? new Date(b.release_date) : new Date(0);
              return dateB - dateA;
            });
          } else {
            // Default sort by popularity or relevance
            creditMovies.sort((a, b) => {
              if (a.relevanceScore !== undefined && b.relevanceScore !== undefined && a.relevanceScore !== b.relevanceScore) {
                return b.relevanceScore - a.relevanceScore;
              }
              return (b.popularity || 0) - (a.popularity || 0);
            });
          }

          results = creditMovies
            .slice(0, 3)
            .map(m => ({
              id: m.id,
              title: m.title,
              overview: m.overview || '',
              vote_average: m.vote_average || 0,
              poster_path: m.poster_path || null,
              release_date: m.release_date || '',
              genre_ids: m.genre_ids || []
            }));
        }
      }

      // 2. Search by Keywords / Theme / Query term
      const queryTerm = keywords || theme || (!actorName && !directorName ? rawQuery : null);
      if (results.length === 0 && queryTerm) {
        console.log(`🔍 TMDB: Searching for movies matching "${queryTerm}"`);
        const searchRes = await axios.get(
          `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(queryTerm)}&page=1`
        );
        let searchMovies = searchRes.data.results || [];

        if (detectedGenreId) {
          searchMovies = searchMovies.filter(m => (m.genre_ids || []).includes(detectedGenreId));
        }

        // Filter out low-vote/obscure films from general keyword searches to favor well-known movies
        let filteredSearch = searchMovies.filter(m => (m.vote_count || 0) >= 100);
        if (filteredSearch.length < 3) {
          filteredSearch = searchMovies.filter(m => (m.vote_count || 0) >= 20);
        }
        if (filteredSearch.length < 3) {
          filteredSearch = searchMovies;
        }
        searchMovies = filteredSearch;

        // Apply sorting
        if (sortBy === 'rating') {
          searchMovies.sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0) || (b.vote_count || 0) - (a.vote_count || 0));
        } else if (sortBy === 'recency') {
          searchMovies.sort((a, b) => {
            const dateA = a.release_date ? new Date(a.release_date) : new Date(0);
            const dateB = b.release_date ? new Date(b.release_date) : new Date(0);
            return dateB - dateA;
          });
        } else {
          searchMovies.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
        }

        results = searchMovies
          .slice(0, 3)
          .map(m => ({
            id: m.id,
            title: m.title,
            overview: m.overview || '',
            vote_average: m.vote_average || 0,
            poster_path: m.poster_path || null,
            release_date: m.release_date || '',
            genre_ids: m.genre_ids || []
          }));
      }

      // Genre-based discovery fallback
      if (results.length === 0 && detectedGenreId) {
        console.log(`TMDB: Discovering movies with genre ID ${detectedGenreId}`);
        const page = Math.floor(Math.random() * 3) + 1;
        const genreRes = await axios.get(
          `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_API_KEY}&with_genres=${detectedGenreId}&sort_by=vote_average.desc&vote_count.gte=100&page=${page}`
        );
        const pool = genreRes.data.results || [];
        const shuffled = pool.sort(() => 0.5 - Math.random());
        results = shuffled.slice(0, 3).map(m => ({
          id: m.id,
          title: m.title,
          overview: m.overview || '',
          vote_average: m.vote_average || 0,
          poster_path: m.poster_path || null,
          release_date: m.release_date || '',
          genre_ids: m.genre_ids || []
        }));
      }

      if (results.length > 0) {
        console.log(`  Returning ${results.length} CineAdvice results from TMDB`);
        return res.json(results);
      }
    } catch (tmdbError) {
      console.error('CineAdvice TMDB failed, falling back to local dataset:', tmdbError.message);
    }
  }

  // Local dataset fallback
  console.log(`🔍 Local Fallback: Searching local database for actor="${actorName}", genre="${genreName}", keywords="${keywords || rawQuery}"`);
  let localResults = movies;

  if (actorName) {
    localResults = localResults.filter(m => m.cast && m.cast.toLowerCase().includes(actorName.toLowerCase()));
  }

  if (genreName && localResults.length > 0) {
    const genreFiltered = localResults.filter(m => m.genres && m.genres.toLowerCase().includes(genreName.toLowerCase()));
    if (genreFiltered.length > 0) localResults = genreFiltered;
  }

  const searchKeywords = keywords || theme || rawQuery;
  const searchTerms = [];
  if (searchKeywords && !searchKeywords.toLowerCase().includes('movie') && !searchKeywords.toLowerCase().includes('film')) {
    searchTerms.push(...searchKeywords.toLowerCase().split(/\s+/));
  }

  if (searchTerms.length > 0 && localResults.length > 0) {
    localResults = localResults.map(m => {
      let score = 0;
      const text = `${m.title || ''} ${m.overview || ''} ${m.genres || ''}`.toLowerCase();
      for (const term of searchTerms) {
        if (text.includes(term)) score += 10;
      }
      m.relevanceScore = score;
      return m;
    });

    if (localResults.some(m => m.relevanceScore > 0)) {
      localResults.sort((a, b) => b.relevanceScore - a.relevanceScore);
    }
  }

  // Sort local results
  if (sortBy === 'rating') {
    localResults.sort((a, b) => {
      if (a.relevanceScore !== undefined && b.relevanceScore !== undefined && a.relevanceScore !== b.relevanceScore) {
        return b.relevanceScore - a.relevanceScore;
      }
      return (b.vote_average || 0) - (a.vote_average || 0);
    });
  } else if (sortBy === 'recency') {
    localResults.sort((a, b) => {
      const dateA = a.release_date ? new Date(a.release_date) : new Date(0);
      const dateB = b.release_date ? new Date(b.release_date) : new Date(0);
      return dateB - dateA;
    });
  } else {
    localResults.sort((a, b) => {
      if (a.relevanceScore !== undefined && b.relevanceScore !== undefined && a.relevanceScore !== b.relevanceScore) {
        return b.relevanceScore - a.relevanceScore;
      }
      return (b.vote_average || 0) - (a.vote_average || 0);
    });
  }

  const sorted = localResults
    .filter(m => (m.vote_average || 0) >= 5)
    .slice(0, 3);

  for (let m of sorted) await enrichPoster(m);
  console.log(`  Returning ${sorted.length} CineAdvice results from local data`);
  res.json(sorted);
});

// Single Movie + Watch Providers
router.get('/:id', async (req, res) => {
  let movie = movies.find(m => m.id === parseInt(req.params.id));

  if (!movie && TMDB_API_KEY) {
    try {
      const response = await axios.get(`https://api.themoviedb.org/3/movie/${req.params.id}?api_key=${TMDB_API_KEY}`);
      movie = {
        id: response.data.id,
        title: response.data.title,
        overview: response.data.overview,
        genres: response.data.genres ? response.data.genres.map(g => g.name).join(', ') : '',
        vote_average: response.data.vote_average,
        poster_path: response.data.poster_path,
        watch_providers: null
      };
    } catch (e) { }
  }

  // Fetch Watch Providers
  if (movie && TMDB_API_KEY) {
    try {
      const providerRes = await axios.get(
        `https://api.themoviedb.org/3/movie/${movie.id}/watch/providers?api_key=${TMDB_API_KEY}`
      );
      const us = providerRes.data.results.US || {};
      movie.watch_providers = {
        flatrate: us.flatrate || [],
        rent: us.rent || [],
        buy: us.buy || []
      };
      console.log(`Watch providers loaded for movie ${movie.id}`);
    } catch (e) {
      console.log("Watch providers fetch failed");
      movie.watch_providers = { flatrate: [], rent: [], buy: [] };
    }
  }

  if (movie) {
    await enrichPoster(movie);
    res.json(movie);
  } else {
    res.status(404).json({ error: "Movie not found" });
  }
});

// Recommendations
router.get('/:id/recommend', async (req, res) => {
  const id = parseInt(req.params.id);
  console.log(`Fetching recommendations for movie ID ${id}`);

  if (TMDB_API_KEY) {
    try {
      const response = await axios.get(`https://api.themoviedb.org/3/movie/${id}/similar?api_key=${TMDB_API_KEY}&page=1`);
      if (response.data && response.data.results && response.data.results.length > 0) {
        console.log(`Retrieved ${response.data.results.length} recommendations from TMDB`);
        res.json(response.data.results.slice(0, 8));
        return;
      }
    } catch (e) {
      console.log("TMDB similar movies fetch failed, falling back to local recommender");
    }
  }

  const { getRecommendations } = require('../utils/recommender');
  let recs = getRecommendations(id);
  for (let m of recs) await enrichPoster(m);
  res.json(recs);
});

module.exports = router;