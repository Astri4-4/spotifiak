import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import { PlayerProvider } from "@/context/PlayerContext";
import { JamProvider } from "@/context/JamContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Layout } from "@/components/Layout";
import { Login } from "@/pages/Login";
import { Home } from "@/pages/Home";
import { Search } from "@/pages/Search";
import { Library } from "@/pages/Library";
import { LikedSongs } from "@/pages/LikedSongs";
import { AlbumDetail } from "@/pages/AlbumDetail";
import { ArtistDetail } from "@/pages/ArtistDetail";
import { PlaylistDetail } from "@/pages/PlaylistDetail";
import { Jam } from "@/pages/Jam";
import { JoinJam } from "@/pages/JoinJam";
import { Settings } from "@/pages/Settings";
import { Activity } from "@/pages/Activity";
import { Queue } from "@/pages/Queue";
import { Track } from "@/pages/Track";
import { Mixes } from "@/pages/Mixes";
import { Mix } from "@/pages/Mix";
import { Lyrics } from "@/pages/Lyrics";
import { SmartPlaylist } from "@/pages/SmartPlaylist";
import { Podcasts } from "@/pages/Podcasts";
import { Podcast } from "@/pages/Podcast";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <JamProvider>
          <PlayerProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route element={<ProtectedRoute />}>
                <Route element={<Layout />}>
                  <Route path="/" element={<Home />} />
                  <Route path="/search" element={<Search />} />
                  <Route path="/library" element={<Library />} />
                  <Route path="/liked" element={<LikedSongs />} />
                  <Route path="/album/:id" element={<AlbumDetail />} />
                  <Route path="/artist/:id" element={<ArtistDetail />} />
                  <Route path="/playlist/:id" element={<PlaylistDetail />} />
                  <Route path="/smart/:id" element={<SmartPlaylist />} />
                  <Route path="/track/:id" element={<Track />} />
                  <Route path="/queue" element={<Queue />} />
                  <Route path="/lyrics" element={<Lyrics />} />
                  <Route path="/jam" element={<Jam />} />
                  <Route path="/jam/:code" element={<JoinJam />} />
                  <Route path="/mixes" element={<Mixes />} />
                  <Route path="/mix/:code" element={<Mix />} />
                  <Route path="/podcasts" element={<Podcasts />} />
                  <Route path="/podcast/:id" element={<Podcast />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/activity" element={<Activity />} />
                </Route>
              </Route>
            </Routes>
          </PlayerProvider>
        </JamProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
