const fs = require('fs');
const path = require('path');

let movies = [];

function loadMovies() {
  const moviesPath = path.join(__dirname, 'tmdb_5000_movies.csv');
  const creditsPath = path.join(__dirname, 'tmdb_5000_credits.csv');

  console.log('Reading movies...');
  const movieLines = fs.readFileSync(moviesPath, 'utf8').split('\n');

  let castMap = {};

  if (fs.existsSync(creditsPath)) {
    console.log('Loading actor data (this may take 8-12 seconds)...');
    const creditsText = fs.readFileSync(creditsPath, 'utf8');

    // Split by movie entries
    const creditEntries = creditsText.split('\n');

    for (let line of creditEntries) {
      if (!line || !line.includes('"cast"')) continue;

      try {
        // Extract movie id
        const idMatch = line.match(/"id":\s*(\d+)/);
        if (!idMatch) continue;
        const id = parseInt(idMatch[1]);

        // Extract cast names
        const castMatch = line.match(/"cast":\s*(\[[\s\S]*?\])/);
        if (castMatch) {
          const castArray = JSON.parse(castMatch[1]);
          const castNames = castArray.slice(0, 10)
            .map(actor => actor.name)
            .join(' ');
          castMap[id] = castNames;
        }
      } catch (e) { }
    }
  }

  // Load movies
  for (let i = 1; i < movieLines.length; i++) {
    if (movieLines[i].trim() === '') continue;

    const values = movieLines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
    if (values.length < 18) continue;

    const id = parseInt(values[3]) || i;

    movies.push({
      id: id,
      title: values[17]?.replace(/^"|"$/g, '').trim() || 'Untitled',
      overview: values[7]?.replace(/^"|"$/g, '').trim() || '',
      genres: values[1]?.replace(/^"|"$/g, '').trim() || '',
      vote_average: parseFloat(values[18]) || 0,
      poster_path: null,
      cast: castMap[id] || ''
    });
  }

  console.log(`Loaded ${movies.length} movies!`);
  console.log(`Actor data loaded for ${Object.keys(castMap).length} movies`);
}

loadMovies();
module.exports = { movies };