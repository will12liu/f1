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
import { Development } from "./ui/manager/Development";
import { Finance } from "./ui/manager/Finance";
import { Inbox } from "./ui/manager/Inbox";
import { Partners } from "./ui/manager/Partners";
import { People } from "./ui/manager/People";

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
          <Route path="rnd" element={<Development />} />
          <Route path="finance" element={<Finance />} />
          <Route path="partners" element={<Partners />} />
          <Route path="people" element={<People />} />
          <Route path="inbox" element={<Inbox />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
