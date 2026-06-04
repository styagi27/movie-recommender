## About
This is an AI Powered movie recommendation system. It uses TMDB API to get movie data and Supabase to store user data. It also uses AI to recommend movies based on user preferences.

# Tech Stack

- React
- Node/Express
- Tailwind CSS
- Supabase for Database and user authentication and storage
- TMDB API for movie data
- Gemini API for AI Powered movie recommendation system.


### How to Run the Project

1. **Set up Environment Variables**: 
   * In the `backend` folder, create a `.env` file with `PORT=8000`, `TMDB_API_KEY`, and `GEMINI_API_KEY`.
   * In the `frontend` folder, create a `.env` file containing your Supabase connection keys (`REACT_APP_SUPABASE_URL` and `REACT_APP_SUPABASE_ANON_KEY`).
2. **Install Dependencies**: Run `npm install` in both the `backend` and `frontend` folders.
3. **Start the Backend Server**: Navigate to the `backend` folder and start the API server by running `npm run dev` (which runs nodemon).
4. **Start the Frontend Client**: Navigate to the `frontend` folder and run `npm start` to launch the React application in your browser at `http://localhost:3000`.


