import { refresh } from "../../core/provider";
import { useSettings } from "../../core/settings";
import { defineWidget, type TileProps } from "../../core/widget";
import { Card } from "../../design/parts/Card";
import { ConnectCard } from "../../design/parts/ConnectCard";
import { Row } from "../../design/parts/Row";
import { Tile } from "../../design/parts/Tile";
import { contributionStats, fetchContributions, githubProvider, gridCells, localDateKey, type GithubData } from "../../providers/github";
import "./github-activity.css";

function GithubLogo() {
  return (
    <svg viewBox="0 0 16 16" width="100%" height="100%" aria-hidden="true">
      <rect width="16" height="16" fill="#1f2328" />
      <path
        fill="#fff"
        transform="translate(2 2) scale(.75)"
        d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
      />
    </svg>
  );
}

function Flame() {
  return (
    <svg className="gh__flame" viewBox="0 0 12 16" aria-hidden="true">
      <path d="M6 0c.6 2.600 4.800 4.700 5.400 8.700C11.900 12.900 9.300 16 6 16S.1 12.900.6 9.400C.9 7.400 2.300 6.500 2.800 4.900c.7.600 1 1.300 1.100 2C5 5.200 6.200 2.800 6 0Z" fill="#c9673a" />
    </svg>
  );
}

function Grid({ data }: { data: GithubData | null }) {
  return (
    <div className="gh__grid">
      {gridCells(data?.days ?? []).map((cell, i) => (
        <i key={i} className="gh__cell" data-level={cell.level} title={cell.date ? `${cell.date}: ${cell.count}` : undefined} />
      ))}
    </div>
  );
}

function GithubTile({ data }: TileProps<GithubData>) {
  const stats = contributionStats(data?.days ?? []);
  return (
    <Tile width={2.67} className="gh">
      <div className="gh__stats">
        <span>
          <b>{stats.today}</b> today
        </span>
        <span>
          <b>{stats.week}</b> week
        </span>
        <span>
          <Flame /> <b>{stats.streak}</b> streak
        </span>
      </div>
      <Grid data={data} />
    </Tile>
  );
}

function GithubCard({ data, status, error }: TileProps<GithubData>) {
  const update = useSettings((s) => s.update);
  const user = useSettings((s) => s.github.user);
  if (status === "sample" || !user) {
    return (
      <Card logo={<GithubLogo />} title="GitHub">
        <ConnectCard
          guide="Enter your GitHub username. Shelf reads your public contribution calendar, so no token is needed. Private work only counts if your profile shows it."
          fields={[{ id: "github-user", label: "GitHub username", placeholder: "octocat", secret: false }]}
          onConnect={async (values) => {
            const name = values["github-user"];
            await fetchContributions(name);
            update({ github: { user: name } });
            refresh(githubProvider);
          }}
        />
      </Card>
    );
  }
  const stats = contributionStats(data?.days ?? []);
  const year = (data?.days ?? []).filter((d) => d.date <= localDateKey()).reduce((sum, d) => sum + d.count, 0);
  return (
    <Card
      logo={<GithubLogo />}
      title="GitHub"
      pill={user}
      footer={error?.message ?? "From your public contribution calendar."}
      action={{ label: "Disconnect", danger: true, onClick: () => update({ github: { user: "" } }) }}
    >
      <Row label="Today" value={stats.today} />
      <Row label="This week" value={stats.week} />
      <Row label="Streak" detail="days in a row" value={stats.streak} />
      <Row label="Past year" value={year.toLocaleString("en-US")} />
      <div className="gh-card">
        <Grid data={data} />
      </div>
    </Card>
  );
}

const SAMPLE_LEVELS = [2, 1, 3, 0, 2, 0, 1, 3, 0, 3, 2, 3, 0, 3, 2, 4, 3, 2, 1, 2, 3, 1, 2, 0, 3, 4, 0, 1, 2, 3, 1, 2, 0, 0, 3, 0, 2, 0, 1];
let sampleDays: { today: string; days: GithubData["days"] } | null = null;

// A believable pattern for the picker and the not-yet-connected tile. It always ends on the day
// it's drawn, however long ago this code loaded, and stays the same array within a day.
const SAMPLE: GithubData = {
  get days() {
    const today = localDateKey();
    if (sampleDays?.today !== today) {
      const days = SAMPLE_LEVELS.map((level, i) => ({ date: localDateKey(Date.now() - (SAMPLE_LEVELS.length - 1 - i) * 86_400_000), level, count: level * 2 }));
      sampleDays = { today, days };
    }
    return sampleDays.days;
  },
};

export default defineWidget<GithubData>({
  id: "github-activity",
  name: "GitHub Activity",
  description: "Your GitHub contributions as a grid, with your current streak.",
  category: "online-mail",
  width: 2.67,
  sample: SAMPLE,
  Tile: GithubTile,
  Card: GithubCard,
  provider: githubProvider,
  menu: () => [{ label: "Logout", danger: true, onClick: () => useSettings.getState().update({ github: { user: "" } }) }],
});
