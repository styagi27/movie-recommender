const { movies } = require('../data/movies');

function getAllFeatures(movie) {
  return `${movie.genres} ${movie.keywords} ${movie.overview}`.toLowerCase();
}

function cosineSimilarity(str1, str2) {
  const words1 = str1.split(' ').filter(Boolean);
  const words2 = str2.split(' ').filter(Boolean);
  
  const allWords = new Set([...words1, ...words2]);
  let dot = 0, mag1 = 0, mag2 = 0;

  allWords.forEach(word => {
    const c1 = words1.filter(w => w === word).length;
    const c2 = words2.filter(w => w === word).length;
    dot += c1 * c2;
    mag1 += c1 * c1;
    mag2 += c2 * c2;
  });

  return dot / (Math.sqrt(mag1) * Math.sqrt(mag2) || 1);
}

function getRecommendations(movieId, topN = 8) {
  const target = movies.find(m => m.id === movieId);
  if (!target) return [];

  const targetFeatures = getAllFeatures(target);

  return movies
    .filter(m => m.id !== movieId)
    .map(movie => ({
      ...movie,
      similarity: cosineSimilarity(targetFeatures, getAllFeatures(movie))
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topN);
}

module.exports = { getRecommendations };