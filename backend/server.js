const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());

console.log('🎬 CineMatch Backend Starting...');

const movieRoutes = require('./routes/movies');

// Correct mounting
app.use('/api/movies', movieRoutes);

app.get('/', (req, res) => {
  res.send('🎥 <h1>CineMatch Backend Running</h1><br><a href="/api/movies">View Movies</a>');
});

app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});