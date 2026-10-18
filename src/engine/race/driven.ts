// What a race the player drove themselves hands back to the season: a classification and the
// line-crossing times the 2D replay needs. The driving happens on the main thread (ui/race/self.ts).
export interface DrivenRow {
  driverId: string;
  teamId: string;
  grid: number;
  pos: number;
  laps: number;
  time: number;
  gap: number;
  status: "Finished" | "Lapped";
  best: number;
  passes: number;
}

export interface DrivenRace {
  laps: number;
  rows: DrivenRow[];
  /** Per car in grid order (pole first). [0] is the grid stagger, then the race time at each line crossing. */
  lapEnd: number[][];
  gridIds: string[];
}

export interface DrivenRound {
  series?: "F2" | "F3";
  race: DrivenRace;
}
