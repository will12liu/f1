import { BrowserRouter, Route, Routes } from "react-router-dom";
import { GameLayout } from "./ui/GameLayout";
import { Home } from "./ui/pages/Home";
import { Dashboard } from "./ui/pages/Dashboard";
import { Calendar } from "./ui/pages/Calendar";
import { Standings } from "./ui/pages/Standings";
import { Teams } from "./ui/pages/Teams";
import { Drivers } from "./ui/pages/Drivers";
import { DriverPage } from "./ui/pages/DriverPage";
import { RacePage } from "./ui/pages/RacePage";
import { History } from "./ui/pages/History";
import { LiveRace } from "./ui/pages/LiveRace";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/g/:id" element={<GameLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="calendar" element={<Calendar />} />
          <Route path="standings" element={<Standings />} />
          <Route path="teams" element={<Teams />} />
          <Route path="drivers" element={<Drivers />} />
          <Route path="driver/:did" element={<DriverPage />} />
          <Route path="race/:round" element={<RacePage />} />
          <Route path="history" element={<History />} />
          <Route path="live" element={<LiveRace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
