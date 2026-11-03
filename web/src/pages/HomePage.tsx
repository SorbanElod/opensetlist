import { ListRow } from '../components/ListRow';
import { PageHeader } from '../components/PageHeader';

// Home: landing pointers to the two main areas — the shell header/nav comes
// from AppShell.
export function HomePage() {
  return (
    <div>
      <PageHeader title="Home" />
      <ul className="list">
        <ListRow
          as="li"
          to="/songs"
          title="Songs"
          meta="The group's song library"
        />
        <ListRow
          as="li"
          to="/setlists"
          title="Setlists"
          meta="Ordered song selections for an event"
        />
      </ul>
    </div>
  );
}
