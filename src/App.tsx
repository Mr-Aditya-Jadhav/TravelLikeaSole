import { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Compass,
  Heart,
  HelpCircle,
  Info,
  Leaf,
  Luggage,
  MapPin,
  Menu,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  UserRound,
  Waves,
  X,
} from 'lucide-react';
import { destinations, filters, type Destination } from './data';
import {
  defaultInput,
  defaultStyle,
  money,
  styleSummary,
  tripDays,
  type TravelStyle,
  type Trip,
  type TripInput,
} from './lib/planner';
import Sole from './components/Sole';
import Dialog from './components/Dialog';
import Planner from './components/Planner';
import StyleFields from './components/StyleFields';
import Itinerary from './components/Itinerary';
import { api } from './lib/api';
import { isResearching, SourcesDialog } from './components/Research';
import WatchDialog from './components/WatchDialog';

type Page = 'discover' | 'trips' | 'saved' | 'style';
type InfoPanel = 'help' | 'sources' | 'watch' | null;
const storage = {
  read(key: string): unknown {
    try {
      return JSON.parse(localStorage.getItem(`sole.v1.${key}`) || 'null');
    } catch {
      return null;
    }
  },
  write(key: string, value: unknown): boolean {
    try {
      localStorage.setItem(`sole.v1.${key}`, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
  remove(key: string) {
    try {
      localStorage.removeItem(`sole.v1.${key}`);
    } catch {
      /* Browser storage can be unavailable. */
    }
  },
};
function isStyle(value: unknown): value is TravelStyle {
  if (!value || typeof value !== 'object') return false;
  const data = value as Record<string, unknown>;
  return (
    ['pace', 'atmosphere', 'walking', 'food', 'stay', 'restrictions', 'notes'].every(
      (key) => typeof data[key] === 'string',
    ) &&
    Array.isArray(data.interests) &&
    data.interests.every((x) => typeof x === 'string')
  );
}
function savedStyle(): TravelStyle | null {
  const value = storage.read('style');
  return isStyle(value) ? value : null;
}
function savedTrips(): Trip[] {
  const value = storage.read('trips');
  if (!Array.isArray(value)) return [];
  return value.filter(
    (x): x is Trip =>
      x &&
      typeof x.id === 'string' &&
      isStyle(x.style) &&
      x.input &&
      typeof x.input.destination === 'string' &&
      typeof x.input.budget === 'string' &&
      ['INR', 'USD', 'EUR', 'GBP', 'IDR', 'JPY'].includes(x.input.currency) &&
      Number.isFinite(x.input.travelers) &&
      Array.isArray(x.days) &&
      x.days.length > 0 &&
      x.days.every(
        (day: unknown) =>
          Array.isArray(day) &&
          day.every(
            (item) =>
              item &&
              typeof item.id === 'string' &&
              typeof item.title === 'string' &&
              typeof item.description === 'string' &&
              typeof item.effort === 'string',
          ),
      ),
  );
}

export default function App() {
  const [page, setPage] = useState<Page>('discover');
  const [mobileNav, setMobileNav] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 760px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 760px)');
    const update = () => {
      setIsMobile(media.matches);
      if (!media.matches) setMobileNav(false);
    };
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (!mobileNav) return;
    document.querySelector<HTMLButtonElement>('.sidebar .nav-item.active')?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileNav(false);
    };
    window.addEventListener('keydown', escape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', escape);
      document.querySelector<HTMLButtonElement>('.mobile-menu')?.focus();
    };
  }, [mobileNav]);
  const [filter, setFilter] = useState('All escapes');
  const [showAll, setShowAll] = useState(false);
  const [query, setQuery] = useState('');
  const [searchDestination, setSearchDestination] = useState('');
  const [plannerInput, setPlannerInput] = useState<TripInput | null>(null);
  const [profile, setProfile] = useState<TravelStyle | null>(savedStyle);
  const [styleEdit, setStyleEdit] = useState<TravelStyle>(
    () => savedStyle() || { ...defaultStyle },
  );
  const [saved, setSaved] = useState<string[]>(() => {
    const value = storage.read('places');
    return Array.isArray(value) ? value.filter((x) => typeof x === 'string') : [];
  });
  const [trips, setTrips] = useState<Trip[]>(savedTrips);
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null);
  const [destination, setDestination] = useState<Destination | null>(null);
  const [info, setInfo] = useState<InfoPanel>(null);
  const [toast, setToast] = useState('');
  const [connectionError, setConnectionError] = useState('');
  useEffect(() => {
    let alive = true;
    void api
      .status()
      .then(async (status) => {
        if (!alive) return;
        if (!status.configured)
          setConnectionError('Live research needs a TinyFish API key in the server configuration.');
        const serverTrips = await api.listTrips();
        if (alive)
          setTrips((local) => [
            ...serverTrips,
            ...local.filter((t) => !t.serverOwned && !serverTrips.some((s) => s.id === t.id)),
          ]);
        const activeId = sessionStorage.getItem('sole.activeTrip');
        if (activeId) {
          try {
            const trip = await api.getTrip(activeId);
            if (alive) {
              setActiveTrip(trip);
              setPage('trips');
              setTrips((current) => [trip, ...current.filter((t) => t.id !== trip.id)]);
            }
          } catch {
            sessionStorage.removeItem('sole.activeTrip');
          }
        }
      })
      .catch((error) => {
        if (alive) setConnectionError(error.message);
      });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (!activeTrip?.serverOwned) return;
    sessionStorage.setItem('sole.activeTrip', activeTrip.id);
    if (!isResearching(activeTrip)) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const fresh = await api.getTrip(activeTrip.id);
        if (stopped) return;
        setActiveTrip(fresh);
        setTrips((current) => current.map((t) => (t.id === fresh.id ? fresh : t)));
        setConnectionError('');
        if (isResearching(fresh)) timer = setTimeout(poll, 2000);
      } catch (error) {
        if (!stopped) {
          setConnectionError(
            error instanceof Error ? error.message : 'Could not update research progress.',
          );
          timer = setTimeout(poll, 5000);
        }
      }
    };
    timer = setTimeout(poll, 1500);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [activeTrip?.id, activeTrip?.research?.status]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 4000);
    return () => clearTimeout(timer);
  }, [toast]);
  const go = (target: Page) => {
    setPage(target);
    setActiveTrip(null);
    setMobileNav(false);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  const beginTrip = (place = searchDestination) => {
    setDestination(null);
    setPlannerInput({ ...defaultInput, destination: place });
  };
  const toggleSaved = (id: string) => {
    const next = saved.includes(id) ? saved.filter((x) => x !== id) : [...saved, id];
    setSaved(next);
    const persisted = storage.write('places', next);
    setToast(
      !persisted
        ? 'Saved for this session. Browser storage is unavailable.'
        : next.includes(id)
          ? 'A little inspiration, saved for later.'
          : 'Destination removed from saved places.',
    );
  };
  const saveProfile = (value: TravelStyle) => {
    setProfile(value);
    setStyleEdit(value);
    setToast(
      storage.write('style', value)
        ? 'Your travel style is saved on this browser.'
        : 'Your style is available this session. Browser storage is unavailable.',
    );
  };
  const saveTrip = async () => {
    if (!activeTrip) return;
    if (activeTrip.serverOwned) {
      try {
        const trip = await api.editTrip(activeTrip.id, {
          action: 'save',
          version: activeTrip.version,
        });
        setActiveTrip(trip);
        setTrips((current) => [trip, ...current.filter((t) => t.id !== trip.id)]);
        setToast('Your trip is saved securely in this browser session.');
      } catch (error) {
        setToast(error instanceof Error ? error.message : 'Could not save your trip.');
      }
      return;
    }
    const next = [activeTrip, ...trips.filter((x) => x.id !== activeTrip.id)];
    setTrips(next);
    setToast(
      storage.write('trips', next)
        ? 'Trip saved on this browser. Your next chapter is waiting.'
        : 'Trip kept for this session. Browser storage is unavailable.',
    );
  };
  const updateTrip = (trip: Trip) => {
    setActiveTrip(trip);
    if (trip.serverOwned) {
      setTrips((current) => current.map((t) => (t.id === trip.id ? trip : t)));
      return;
    }
    if (trips.some((x) => x.id === trip.id)) {
      const next = trips.map((x) => (x.id === trip.id ? trip : x));
      setTrips(next);
      if (!storage.write('trips', next))
        setToast('Changes kept for this session. Browser storage is unavailable.');
    }
  };
  const navItems = [
    { id: 'discover' as const, label: 'Discover', icon: Compass },
    { id: 'trips' as const, label: 'My trips', icon: Luggage },
    { id: 'saved' as const, label: 'Saved places', icon: Heart },
    { id: 'style' as const, label: 'My travel style', icon: SlidersHorizontal },
  ];
  const visibleDestinations = destinations.filter(
    (d) =>
      (filter === 'All escapes' || d.categories.includes(filter)) &&
      `${d.name} ${d.country} ${d.mood}`.toLowerCase().includes(query.toLowerCase()),
  );
  const card = (d: Destination) => (
    <article className="destination-card" key={d.id}>
      <div className="destination-image">
        <button
          className="destination-image-link"
          onClick={() => setDestination(d)}
          aria-label={`Explore ${d.name}`}
        >
          <img
            src={d.image}
            alt={`${d.name}, ${d.country} destination inspiration`}
            loading="lazy"
          />
        </button>
        <span className="destination-tag">{d.tag}</span>
        <button
          className={`save-button ${saved.includes(d.id) ? 'is-saved' : ''}`}
          aria-label={`${saved.includes(d.id) ? 'Unsave' : 'Save'} ${d.name}`}
          aria-pressed={saved.includes(d.id)}
          onClick={() => toggleSaved(d.id)}
        >
          <Heart size={17} fill={saved.includes(d.id) ? 'currentColor' : 'none'} />
        </button>
        <div className="image-location">
          <MapPin size={12} />
          {d.country}
        </div>
      </div>
      <button className="destination-content" onClick={() => setDestination(d)}>
        <div>
          <h3>{d.name}</h3>
          <p>{d.mood}</p>
        </div>
        <span className="card-arrow">
          <ArrowUpRight size={19} />
        </span>
      </button>
    </article>
  );

  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      {mobileNav && (
        <button
          className="nav-scrim"
          aria-label="Close navigation"
          onClick={() => setMobileNav(false)}
        />
      )}
      <aside
        className={`sidebar ${mobileNav ? 'open' : ''}`}
        inert={isMobile && !mobileNav}
        aria-hidden={isMobile && !mobileNav}
      >
        <button className="brand" aria-label="TravelLikeaSole home" onClick={() => go('discover')}>
          <span className="brand-mark">
            <Sole small />
          </span>
          <span>
            travel<span className="brand-light">likea</span>sole<span className="brand-dot">.</span>
            <small>FIND YOUR CURRENT</small>
          </span>
        </button>
        <button
          className="icon-button mobile-nav-close"
          aria-label="Close navigation"
          onClick={() => setMobileNav(false)}
        >
          <X size={20} />
        </button>
        <div className="sidebar-main">
          <span className="nav-label">YOUR LITTLE WORLD</span>
          <nav aria-label="Main navigation">
            {navItems.map(({ id, label, icon: Icon }) => (
              <button
                className={`nav-item ${page === id ? 'active' : ''}`}
                key={id}
                aria-current={page === id ? 'page' : undefined}
                onClick={() => go(id)}
              >
                <Icon size={19} />
                <span>{label}</span>
                {id === 'trips' && trips.length > 0 && (
                  <span className="nav-count">{trips.length}</span>
                )}
                {id === 'discover' && <span className="active-dot" />}
              </button>
            ))}
          </nav>
          <button className="sidebar-new-trip" onClick={() => beginTrip('')}>
            <Plus size={17} />
            Plan a new trip
          </button>
        </div>
        <div className="sidebar-bottom">
          <div className="meet-sole-card">
            <div className="sole-card-art">
              <span className="little-spark spark-one">✧</span>
              <Sole />
              <span className="little-spark spark-two">✧</span>
              <svg className="little-wave" viewBox="0 0 180 30" aria-hidden="true">
                <path
                  d="M0 14Q22 0 45 14t45 0 45 0 45 0M0 23Q22 9 45 23t45 0 45 0 45 0"
                  fill="none"
                  stroke="#C8DAD1"
                  strokeWidth="1.3"
                />
              </svg>
            </div>
            <strong>A little help from Sole.</strong>
            <p>
              Your travel companion.
              <br />
              Big on the little details.
            </p>
            <button className="text-button" onClick={() => setInfo('help')}>
              Meet your guide
              <ArrowRight size={14} />
            </button>
          </div>
          <button className="help-link" onClick={() => setInfo('help')}>
            <HelpCircle size={17} />A little guidance
          </button>
          <a className="help-link" href="/about">
            <Info size={17} />
            About this app
          </a>
          <div className="sidebar-user">
            <span className="avatar">
              <UserRound size={20} />
            </span>
            <div>
              <strong>The curious traveler</strong>
              <span>Your next chapter awaits</span>
            </div>
            <Leaf size={16} />
          </div>
        </div>
      </aside>

      <div className="app-main" inert={mobileNav}>
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              aria-expanded={mobileNav}
              onClick={() => setMobileNav(true)}
            >
              <Menu size={21} />
            </button>
            <span>{activeTrip ? 'My trips' : navItems.find((x) => x.id === page)?.label}</span>
            <ChevronRight size={13} />
            <span className="breadcrumb-detail">
              {activeTrip
                ? activeTrip.input.destination
                : page === 'discover'
                  ? 'A world of possibilities'
                  : page === 'trips'
                    ? 'Your next chapters'
                    : page === 'saved'
                      ? 'Little sparks of inspiration'
                      : 'Made for you'}
            </span>
          </div>
          <div className="topbar-right">
            <span className="topbar-tagline">
              <Waves size={17} />
              Find your current. Travel your way.
            </span>
            <button
              className="topbar-profile"
              aria-label="Open my travel style"
              onClick={() => go('style')}
            >
              <UserRound size={17} />
            </button>
          </div>
        </header>
        <main id="main-content" className="content" tabIndex={-1}>
          {connectionError && (
            <div className="info-banner connection-banner" role="status">
              <Info size={17} />
              <p>{connectionError}</p>
            </div>
          )}
          {activeTrip ? (
            <Itinerary
              trip={activeTrip}
              saved={
                activeTrip.serverOwned
                  ? activeTrip.saved === true
                  : trips.some((x) => x.id === activeTrip.id)
              }
              onChange={updateTrip}
              onSave={saveTrip}
              onBack={() => go('trips')}
              onInfo={setInfo}
            />
          ) : (
            <>
              {page === 'discover' && (
                <div className="page-enter">
                  <div className="page-intro">
                    <div>
                      <span className="eyebrow greeting">
                        A LITTLE WANDERLUST LOOKS GOOD ON YOU <span>✦</span>
                      </span>
                      <h1>There’s a whole world waiting.</h1>
                      <p>Let’s find the part that feels like you.</p>
                    </div>
                    <button
                      className="text-button how-button"
                      onClick={() =>
                        document.getElementById('how-it-works')?.scrollIntoView({
                          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
                            ? 'instant'
                            : 'smooth',
                        })
                      }
                    >
                      How it works
                      <ArrowDown size={15} />
                    </button>
                  </div>
                  <section className="hero" aria-label="Start planning your next escape">
                    <div className="hero-shade" />
                    <div className="hero-copy">
                      <span className="hero-eyebrow">
                        <span />
                        LESS PLANNING. MORE LIVING.
                      </span>
                      <h2>
                        Where’s your
                        <br />
                        next <em>escape?</em>
                      </h2>
                      <p>
                        Pick a place. Sole will find a trip
                        <br className="desktop-break" /> that fits your kind of travel.
                      </p>
                    </div>
                    <div className="hero-place">
                      <MapPin size={13} />
                      Somewhere worth slowing down.<span>The Italian lakes</span>
                    </div>
                    <div className="hero-sole">
                      <Sole />
                      <div>
                        <strong>“You bring the curiosity.</strong>
                        <span>I’ll help with the rest.”</span>
                      </div>
                    </div>
                  </section>
                  <form
                    className="escape-search"
                    onSubmit={(e) => {
                      e.preventDefault();
                      beginTrip();
                    }}
                  >
                    <label className="search-destination">
                      <MapPin size={20} />
                      <span>
                        <strong>Your next chapter starts in…</strong>
                        <input
                          aria-label="Your destination"
                          list="home-destinations"
                          placeholder="A city, a country, a little daydream"
                          value={searchDestination}
                          onChange={(e) => setSearchDestination(e.target.value)}
                        />
                      </span>
                    </label>
                    <datalist id="home-destinations">
                      {destinations.map((d) => (
                        <option key={d.id} value={`${d.name}, ${d.country}`} />
                      ))}
                    </datalist>
                    <button type="button" className="search-detail" onClick={() => beginTrip()}>
                      <CalendarDays size={19} />
                      <span>
                        <strong>When?</strong>
                        <span>I’m flexible</span>
                      </span>
                      <ChevronDown size={14} />
                    </button>
                    <button className="button button-primary search-submit" type="submit">
                      Find my escape
                      <Sparkles size={17} />
                    </button>
                  </form>
                  <div className="reassurance-row">
                    <span>
                      <Check size={13} />
                      Your pace, your preferences
                    </span>
                    <span>
                      <Check size={13} />
                      Room for the unexpected
                    </span>
                    <span>
                      <Check size={13} />A plan you can make your own
                    </span>
                  </div>
                  <section className="discovery-section">
                    <div className="section-heading">
                      <div>
                        <span className="eyebrow">FOLLOW A FEELING</span>
                        <h2>What’s calling you?</h2>
                        <p>No wrong turns. Just different kinds of wonderful.</p>
                      </div>
                      <button
                        className="text-button"
                        onClick={() => {
                          setShowAll(!showAll);
                          setFilter('All escapes');
                        }}
                      >
                        {showAll ? 'Show a little less' : 'Explore all destinations'}
                        <ArrowUpRight size={16} />
                      </button>
                    </div>
                    <div className="filter-row" aria-label="Destination categories">
                      {filters.map(({ label, icon: Icon }) => (
                        <button
                          key={label}
                          aria-pressed={filter === label}
                          className={`filter-chip ${filter === label ? 'active' : ''}`}
                          onClick={() => {
                            setFilter(label);
                            setShowAll(true);
                          }}
                        >
                          <Icon size={16} />
                          {label}
                        </button>
                      ))}
                    </div>
                    <div className="destination-grid">
                      {(showAll ? visibleDestinations : visibleDestinations.slice(0, 4)).map(card)}
                    </div>
                    <p className="inspiration-note">
                      A few places to spark your imagination. Your trip will be shaped around you.
                    </p>
                  </section>
                  <section className="personal-banner">
                    <div className="personal-banner-icon">
                      <Settings2 size={27} />
                      <span>✦</span>
                    </div>
                    <div>
                      <span className="eyebrow">
                        YOU’RE ONE OF A KIND. YOUR TRIP SHOULD BE TOO.
                      </span>
                      <h3>
                        {profile
                          ? 'Same travel style. A whole new horizon.'
                          : 'More you. Less one-size-fits-all.'}
                      </h3>
                      <p>
                        {profile
                          ? 'Your saved preferences are ready for wherever you go next.'
                          : 'Slow mornings or full days? Local flavors or quiet corners? Sole gets your kind of travel.'}
                      </p>
                    </div>
                    <button className="button button-secondary" onClick={() => go('style')}>
                      {profile ? 'View my travel style' : 'Find my travel style'}
                      <ArrowRight size={16} />
                    </button>
                  </section>
                  <section className="how-it-works" id="how-it-works">
                    <div className="section-heading">
                      <div>
                        <span className="eyebrow">A LITTLE SIMPLER, A LOT MORE PERSONAL</span>
                        <h2>From “what if” to “let’s go.”</h2>
                      </div>
                      <Sole small />
                    </div>
                    <div className="how-grid">
                      {[
                        {
                          n: '01',
                          icon: MapPin,
                          title: 'Follow your curiosity',
                          text: 'Choose a destination, a few dates, and a budget that feels right.',
                        },
                        {
                          n: '02',
                          icon: SlidersHorizontal,
                          title: 'Make it feel like you',
                          text: 'Tell Sole about your pace, your tastes, and the things you love.',
                        },
                        {
                          n: '03',
                          icon: Luggage,
                          title: 'Find your own current',
                          text: 'Shape your draft, leave room to wander, and make the trip your own.',
                        },
                      ].map(({ n, icon: Icon, title, text }) => (
                        <div className="how-card" key={n}>
                          <span className="how-number">{n}</span>
                          <Icon size={23} />
                          <h3>{title}</h3>
                          <p>{text}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              )}

              {page === 'saved' && (
                <div className="collection-page page-enter">
                  <div className="page-intro">
                    <div>
                      <span className="eyebrow">A LITTLE DAYDREAMING NEVER HURT</span>
                      <h1>Places that stay with you.</h1>
                      <p>Your collection of “someday, I’ll go there.”</p>
                    </div>
                    <span className="collection-count">
                      {saved.length} saved {saved.length === 1 ? 'place' : 'places'}
                    </span>
                  </div>
                  {saved.length ? (
                    <>
                      <div className="collection-search">
                        <Search size={18} />
                        <input
                          aria-label="Search saved places"
                          placeholder="Find a little inspiration…"
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                        />
                      </div>
                      <div className="destination-grid">
                        {destinations
                          .filter(
                            (d) =>
                              saved.includes(d.id) &&
                              `${d.name} ${d.country}`.toLowerCase().includes(query.toLowerCase()),
                          )
                          .map(card)}
                      </div>
                      {!destinations.some(
                        (d) =>
                          saved.includes(d.id) &&
                          `${d.name} ${d.country}`.toLowerCase().includes(query.toLowerCase()),
                      ) && (
                        <p className="empty-search">
                          No saved places match “{query}”. Try another name.
                        </p>
                      )}
                      <p className="field-note">
                        Saved on this browser. Tap a heart to remove a place.
                      </p>
                    </>
                  ) : (
                    <div className="empty-state">
                      <span className="empty-icon">
                        <Heart size={35} />
                      </span>
                      <h2>A home for your daydreams.</h2>
                      <p>
                        Tap the heart on any destination to keep a little inspiration for later.
                      </p>
                      <button className="button button-primary" onClick={() => go('discover')}>
                        Find some inspiration
                        <ArrowRight size={17} />
                      </button>
                    </div>
                  )}
                </div>
              )}

              {page === 'trips' && (
                <div className="collection-page page-enter">
                  <div className="page-intro">
                    <div>
                      <span className="eyebrow">THE STORIES YOU HAVEN’T TOLD YET</span>
                      <h1>Your next chapters.</h1>
                      <p>A place for plans, possibilities, and a little anticipation.</p>
                    </div>
                    <button className="button button-primary" onClick={() => beginTrip('')}>
                      <Plus size={17} />
                      Plan a trip
                    </button>
                  </div>
                  {trips.length ? (
                    <div className="trip-grid">
                      {trips.map((trip) => {
                        const place = destinations.find((d) =>
                          trip.input.destination.toLowerCase().includes(d.name.toLowerCase()),
                        );
                        return (
                          <article className="trip-card" key={trip.id}>
                            <button
                              className="trip-cover"
                              onClick={() => setActiveTrip(trip)}
                              style={{
                                backgroundImage: `url(${place?.image || '/images/hero.jpg'})`,
                              }}
                            >
                              <span>
                                {trip.research
                                  ? isResearching(trip)
                                    ? 'Researching'
                                    : trip.research.evidence.length
                                      ? 'Sourced plan'
                                      : 'Research needs attention'
                                  : 'Local draft'}
                              </span>
                              <h2>{trip.input.destination}</h2>
                            </button>
                            <div className="trip-card-body">
                              <div>
                                <CalendarDays size={16} />
                                <span>
                                  {tripDays(trip.input)} days · {trip.input.travelers}{' '}
                                  {trip.input.travelers === 1 ? 'traveler' : 'travelers'}
                                </span>
                              </div>
                              <p>
                                {money(Number(trip.input.budget), trip.input.currency)}{' '}
                                {trip.input.basis}
                              </p>
                              <div className="trip-card-actions">
                                <button className="text-button" onClick={() => setActiveTrip(trip)}>
                                  Open my trip
                                  <ArrowRight size={15} />
                                </button>
                                <button
                                  className="icon-button"
                                  aria-label={`Delete trip to ${trip.input.destination}`}
                                  onClick={async () => {
                                    if (trip.serverOwned) {
                                      try {
                                        await api.deleteTrip(trip.id);
                                        setTrips((current) =>
                                          current.filter((t) => t.id !== trip.id),
                                        );
                                        setToast('Trip removed from your session.');
                                      } catch (error) {
                                        setToast(
                                          error instanceof Error
                                            ? error.message
                                            : 'Could not remove this trip.',
                                        );
                                      }
                                      return;
                                    }
                                    const next = trips.filter((x) => x.id !== trip.id);
                                    setTrips(next);
                                    storage.write('trips', next);
                                    setToast('Trip removed from this browser.');
                                  }}
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="empty-state">
                      <Sole />
                      <h2>Every good story starts somewhere.</h2>
                      <p>
                        Your next escape is a few small choices away. Let’s make it one that feels
                        like you.
                      </p>
                      <button className="button button-primary" onClick={() => beginTrip('')}>
                        Plan my first escape
                        <Sparkles size={17} />
                      </button>
                    </div>
                  )}
                  <p className="storage-note">
                    <ShieldCheck size={15} />
                    Saved trips belong to this browser’s private session. Your reusable travel style
                    is saved separately, with your permission.
                  </p>
                </div>
              )}

              {page === 'style' && (
                <div className="style-page page-enter">
                  <div className="page-intro">
                    <div>
                      <span className="eyebrow">A LITTLE SELF-DISCOVERY</span>
                      <h1>What’s your kind of travel?</h1>
                      <p>Your pace. Your preferences. A travel style that’s entirely you.</p>
                    </div>
                  </div>
                  <div className="style-page-grid">
                    <section className="style-editor">
                      <div className="style-editor-heading">
                        <h2>The little things that make it yours.</h2>
                        <span>{profile ? 'Saved on this browser' : 'Not saved yet'}</span>
                      </div>
                      <StyleFields value={styleEdit} onChange={setStyleEdit} />
                      <div className="style-save-row">
                        <p>
                          <ShieldCheck size={16} />
                          Save only if you’d like to reuse this style on this browser.
                        </p>
                        <button
                          className="button button-primary"
                          onClick={() => saveProfile(styleEdit)}
                        >
                          Save my travel style
                          <Check size={17} />
                        </button>
                      </div>
                      {profile && (
                        <button
                          className="text-button delete-style"
                          onClick={() => {
                            storage.remove('style');
                            setProfile(null);
                            setStyleEdit({ ...defaultStyle });
                            setToast('Your saved travel style has been deleted.');
                          }}
                        >
                          <Trash2 size={15} />
                          Delete my saved style
                        </button>
                      )}
                    </section>
                    <aside>
                      <div className="style-summary-card">
                        <Sole />
                        <span className="eyebrow">A LITTLE LIKE YOU?</span>
                        <h3>
                          Your travel personality,
                          <br />
                          without the labels.
                        </h3>
                        <p>{styleSummary(styleEdit)}</p>
                        <div className="chips">
                          {styleEdit.interests.map((x) => (
                            <span className="chip selected" key={x}>
                              {x}
                            </span>
                          ))}
                        </div>
                        <div className="summary-divider" />
                        <p className="field-note">
                          Your choices guide each trip. You can always change things for one
                          particular escape.
                        </p>
                      </div>
                    </aside>
                  </div>
                </div>
              )}
            </>
          )}
          <footer className="page-footer">
            <span>
              <Waves size={15} />A little curiosity can take you a long way.
            </span>
            <span>Made for your kind of somewhere.</span>
          </footer>
        </main>
      </div>

      {plannerInput && (
        <Planner
          initialInput={plannerInput}
          initialStyle={profile || { ...defaultStyle }}
          hasSavedStyle={!!profile}
          onClose={() => setPlannerInput(null)}
          onComplete={(trip) => {
            setActiveTrip(trip);
            setTrips((current) => [trip, ...current.filter((t) => t.id !== trip.id)]);
            setPage('trips');
            setPlannerInput(null);
            window.scrollTo({ top: 0, behavior: 'instant' });
          }}
          onSaveStyle={saveProfile}
        />
      )}
      {destination && (
        <Dialog title={`Discover ${destination.name}`} onClose={() => setDestination(null)}>
          <img
            className="destination-dialog-image"
            src={destination.image}
            alt={`Inspiration for ${destination.name}`}
          />
          <div className="destination-dialog-body">
            <span className="eyebrow">
              <MapPin size={14} />
              {destination.country} · {destination.area}
            </span>
            <h2>A little more {destination.name}.</h2>
            <p>{destination.description}</p>
            <div className="chips">
              {destination.categories.map((x) => (
                <span className="chip" key={x}>
                  {x}
                </span>
              ))}
            </div>
            <div className="info-banner">
              <Info size={17} />
              <p>
                Destination inspiration. Your dates, budget, and preferences will shape your own
                draft. Availability and travel details need research.
              </p>
            </div>
            <div className="destination-dialog-actions">
              <a className="text-button" href={destination.source} target="_blank" rel="noreferrer">
                Official tourism guide
                <ArrowUpRight size={15} />
              </a>
              <button
                className="button button-primary"
                onClick={() => beginTrip(`${destination.name}, ${destination.country}`)}
              >
                Make it my escape
                <ArrowRight size={17} />
              </button>
            </div>
          </div>
        </Dialog>
      )}
      {info === 'sources' && activeTrip && (
        <SourcesDialog trip={activeTrip} onClose={() => setInfo(null)} />
      )}
      {info === 'watch' && activeTrip?.serverOwned && (
        <WatchDialog trip={activeTrip} onClose={() => setInfo(null)} />
      )}
      {info === 'help' && (
        <Dialog title="Meet Sole" onClose={() => setInfo(null)}>
          <div className="info-dialog">
            <Sole />
            <span className="eyebrow">A LITTLE GUIDANCE</span>
            <h2>Hi, I’m Sole.</h2>
            <p>
              Pick a place, share what matters to you, and we’ll shape a trip that feels like you.
            </p>
            <div className="guide-steps">
              <div>
                <span>1</span>Choose a destination, dates, and budget.
              </div>
              <div>
                <span>2</span>Pick your pace, interests, and preferences.
              </div>
              <div>
                <span>3</span>Review live sources, adjust your plan, and watch for useful changes.
              </div>
            </div>
            <div className="info-banner">
              <Info size={17} />
              <p>
                Sole uses TinyFish Search, Fetch, Agent, Browser, and opt-in Monitor. Source gaps
                are visible, and purchases always stay with you.
              </p>
            </div>
            <button className="button button-primary" onClick={() => setInfo(null)}>
              Got it
              <Check size={17} />
            </button>
          </div>
        </Dialog>
      )}
      {info === 'watch' && !activeTrip?.serverOwned && (
        <Dialog title="Research this trip first" onClose={() => setInfo(null)}>
          <div className="info-dialog">
            <Sole />
            <h2>First, a few real sources.</h2>
            <p>
              This is an older local draft. Select Research this trip in the itinerary to collect
              live evidence, then choose a source or topic to watch.
            </p>
            <button className="button button-primary" onClick={() => setInfo(null)}>
              Got it
              <Check size={17} />
            </button>
          </div>
        </Dialog>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          <span>{toast}</span>
          <button aria-label="Dismiss message" onClick={() => setToast('')}>
            <X size={15} />
          </button>
        </div>
      )}
    </>
  );
}
