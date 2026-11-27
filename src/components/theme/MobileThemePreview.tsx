'use client';

import { useState } from 'react';
import styles from './MobileThemePreview.module.scss';

export type MobileThemeOption = {
  primary_color?: string;
  secondary_color?: string;
  button_primary_color?: string;
  button_secondary_color?: string;
  text_color?: string | null;
  body_text_color?: string | null;
};

export type MobileThemePreviewProps = {
  theme?: MobileThemeOption | null;
  primaryColor?: string;
  secondaryColor?: string;
  buttonPrimaryColor?: string;
  buttonSecondaryColor?: string;
  textColor?: string;
  bodyTextColor?: string;
  hasThemeSelected?: boolean;
  eventTitle?: string | null;
  greetingsText?: string | null;
  bannerImage?: string | null;
  groomName?: string | null;
  brideName?: string | null;
  layout?: 'single' | 'all';
};

type ScreenType = 'dashboard' | 'schedule' | 'feed';

export function MobileThemePreview({
  theme,
  primaryColor,
  secondaryColor,
  buttonPrimaryColor,
  buttonSecondaryColor,
  textColor,
  bodyTextColor,
  hasThemeSelected,
  eventTitle,
  greetingsText,
  bannerImage,
  groomName,
  brideName,
  layout = 'single',
}: MobileThemePreviewProps) {
  const [activeTabScreen, setActiveTabScreen] = useState<ScreenType>('dashboard');

  // Determine whether a custom theme is actively applied or "No theme" (default dark)
  const isSelected = hasThemeSelected ?? Boolean(theme || (primaryColor && primaryColor !== '#0B0D14'));

  const pri = theme?.primary_color ?? primaryColor ?? '#0B0D14';
  const sec = theme?.secondary_color ?? secondaryColor ?? pri;
  const btnPri = theme?.button_primary_color ?? buttonPrimaryColor ?? '#22C55E';
  const btnSec = theme?.button_secondary_color ?? buttonSecondaryColor ?? btnPri;
  const txtColor = theme?.text_color ?? textColor ?? '#FFFFFF';
  const bodyColor = theme?.body_text_color ?? bodyTextColor ?? (isSelected ? '#CBD5E1' : '#94A3B8');

  // When no theme is selected: default clean dark background (#0B0D14). No colorful gradient.
  const isBgGradient = isSelected && pri.toLowerCase() !== sec.toLowerCase();
  const screenBackground = !isSelected
    ? '#0B0D14'
    : isBgGradient
      ? `linear-gradient(180deg, ${pri} 0%, ${sec} 100%)`
      : pri;

  // When no theme is selected: default clean button styling.
  const isBtnGradient = isSelected && btnPri.toLowerCase() !== btnSec.toLowerCase();
  const buttonStyle = !isSelected
    ? '#22C55E'
    : isBtnGradient
      ? `linear-gradient(135deg, ${btnPri} 0%, ${btnSec} 100%)`
      : btnPri;

  // POC card background:
  const pocCardBackground = !isSelected ? '#181C26' : buttonStyle;
  const pocCardBorder = !isSelected ? '1px solid rgba(255, 255, 255, 0.08)' : 'none';

  // Dynamic user data with clean fallbacks
  const titleText = eventTitle?.trim() || 'Abhi & Aish Wedding 💍✨';
  const subtitleText =
    greetingsText?.trim() || 'Two hearts, one beautiful journey, and a lifetime of memories to create.';
  const coupleHeading =
    groomName && brideName
      ? `${groomName.toUpperCase()} & ${brideName.toUpperCase()}`
      : 'ABHIAISH Wedding';

  // Hero image: User's uploaded banner image, or clean sample couple image (with NO baked-in text)
  const heroImg = bannerImage?.trim() || '/mobile-preview/dashboard_hero_sample.jpg';

  const renderPhoneViewport = (currentScreen: ScreenType, interactive = false) => {
    return (
      <div className={styles.phoneFrame}>
        {/* Dynamic Island */}
        <div className={styles.dynamicIsland} />

        <div className={styles.screenViewport} style={{ background: screenBackground }}>
          {/* Status Bar */}
          <div className={styles.statusBar} style={{ color: txtColor }}>
            <span>9:41</span>
            <div className={styles.statusIcons}>
              <span>VoLTE</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 3c-4.97 0-9 4.03-9 9 0 2.12.74 4.07 1.97 5.61L4.35 19H19.65l-.62-1.39C20.26 16.07 21 14.12 21 12c0-4.97-4.03-9-9-9z" />
              </svg>
              <span>87%</span>
            </div>
          </div>

          {/* SCREEN 1: DASHBOARD / HOME */}
          {currentScreen === 'dashboard' && (
            <div className={styles.dashboardScreen}>
              <div className={styles.topBar}>
                <span className={styles.screenTitle} style={{ color: txtColor }}>
                  Home
                </span>
                <button
                  type="button"
                  className={styles.bellBtn}
                  style={{ color: txtColor }}
                  aria-label="Notifications"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                  <span className={styles.bellDot} />
                </button>
              </div>

              {/* Hero Banner: Clean background image + single layer of dynamic HTML text */}
              <div className={styles.heroBanner} style={{ backgroundImage: `url("${heroImg}")` }}>
                <div className={styles.heroOverlay} />
                <div className={styles.heroContent}>
                  <span className={styles.heroTitle} style={{ color: txtColor }}>
                    {titleText}
                  </span>
                  <span className={styles.heroSubtitle} style={{ color: bodyColor }}>
                    {subtitleText}
                  </span>
                  <span className={styles.heroHeading} style={{ color: txtColor }}>
                    {coupleHeading}
                  </span>
                </div>
              </div>

              {/* Category Pills */}
              <div className={styles.categoryPills}>
                <div className={styles.catPill}>MEHENDI</div>
                <div className={styles.catPill}>REELSHEEL</div>
                <div className={styles.catPill}>MEMORY BOOK</div>
              </div>

              {/* POC Card */}
              <div
                className={styles.pocCard}
                style={{ background: pocCardBackground, border: pocCardBorder }}
              >
                <div className={styles.pocLeft}>
                  <img
                    src="/mobile-preview/poc_sample.jpg"
                    alt="POC"
                    className={styles.pocAvatar}
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src =
                        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100';
                    }}
                  />
                  <div className={styles.pocInfo}>
                    <span className={styles.pocName} style={{ color: txtColor }}>
                      ABHISHEK UPADHYAY
                    </span>
                    <span className={styles.pocContact} style={{ color: bodyColor }}>
                      +91 94254 24931
                    </span>
                    <span className={styles.pocContact} style={{ color: bodyColor }}>
                      abhishekup141@gmail.com
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className={styles.pocCallBtn}
                  style={{ background: '#ffffff', color: '#0f172a' }}
                  aria-label="Call POC"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.02-.24 11.72 11.72 0 003.68.59 1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1 11.72 11.72 0 00.59 3.68 1 1 0 01-.24 1.02l-2.23 2.09z" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* SCREEN 2: SCHEDULE */}
          {currentScreen === 'schedule' && (
            <div className={styles.scheduleScreen}>
              <div className={styles.topBar}>
                <span className={styles.screenTitle} style={{ color: txtColor }}>
                  Event Schedule
                </span>
                <button
                  type="button"
                  className={styles.bellBtn}
                  style={{ color: txtColor }}
                  aria-label="Notifications"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                </button>
              </div>

              {/* Date Filter Chips */}
              <div className={styles.filterChips}>
                <div
                  className={styles.chipActive}
                  style={{ background: buttonStyle, color: isSelected ? txtColor : '#FFFFFF' }}
                >
                  All
                </div>
                <div className={styles.chipOutline} style={{ color: bodyColor }}>
                  20th Nov
                </div>
                <div className={styles.chipOutline} style={{ color: bodyColor }}>
                  21st Nov
                </div>
              </div>

              {/* Session Card 1: Mehendi (Clean wedding arch on beach) */}
              <div
                className={styles.sessionCard}
                style={{ backgroundImage: 'url("/mobile-preview/schedule_sample.jpg")' }}
              >
                <div className={styles.sessionOverlay} />
                <div className={styles.sessionTop}>
                  <span className={styles.sessionTitle} style={{ color: txtColor }}>
                    MEHENDI
                  </span>
                </div>
                <div className={styles.sessionBottom}>
                  <p className={styles.sessionDesc} style={{ color: bodyColor }}>
                    Celebrate love, laughter, and beautiful traditions with an enchanting Mehendi ceremony…
                  </p>
                  <div className={styles.sessionActions}>
                    <div className={styles.venuePill}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z" />
                      </svg>
                      <span>Phase Test Palace</span>
                    </div>
                    <button
                      type="button"
                      className={styles.sessionArrowBtn}
                      style={{ background: buttonStyle, color: isSelected ? txtColor : '#FFFFFF' }}
                      aria-label="View Session"
                    >
                      ↗
                    </button>
                  </div>
                </div>
              </div>

              {/* Session Card 2: Haldi */}
              <div
                className={styles.sessionCard}
                style={{
                  height: '75px',
                  backgroundImage:
                    'linear-gradient(to right, rgba(0,0,0,0.6), rgba(0,0,0,0.2)), url("https://images.unsplash.com/photo-1545232979-fbf6c1410116?w=400")',
                }}
              >
                <div className={styles.sessionOverlay} />
                <div className={styles.sessionTop}>
                  <span className={styles.sessionTitle} style={{ color: txtColor }}>
                    HALDI
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* SCREEN 3: FEEDS */}
          {currentScreen === 'feed' && (
            <div className={styles.feedScreen}>
              <div className={styles.topBar}>
                <span className={styles.screenTitle} style={{ color: txtColor }}>
                  Feeds
                </span>
                <button
                  type="button"
                  className={styles.bellBtn}
                  style={{ color: txtColor }}
                  aria-label="Notifications"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                  <span className={styles.bellDot} />
                </button>
              </div>

              {/* Post Card */}
              <div className={styles.postCard}>
                <div className={styles.postHeader}>
                  <img
                    src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=60"
                    alt="gaurang"
                    className={styles.postAvatar}
                  />
                  <div className={styles.postMeta}>
                    <span className={styles.postAuthor} style={{ color: txtColor }}>
                      gaurang
                    </span>
                    <span className={styles.postTime} style={{ color: bodyColor }}>
                      2 weeks ago
                    </span>
                  </div>
                </div>

                <p className={styles.postCaption} style={{ color: bodyColor }}>
                  ai test
                </p>

                <img
                  src="/mobile-preview/feed_sample.jpg"
                  alt="Post"
                  className={styles.postImage}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src =
                      'https://images.unsplash.com/photo-1511285560929-80b456fea0bc?w=400';
                  }}
                />

                <div className={styles.postActions} style={{ color: txtColor }}>
                  <div className={styles.postLeftActions}>
                    <span className={styles.actionItem}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
                      </svg>
                      1
                    </span>
                    <span className={styles.actionItem}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                      </svg>
                      0
                    </span>
                    <span className={styles.actionItem}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="22" y1="2" x2="11" y2="13" />
                        <polygon points="22 2 15 22 11 13 2 9 22 2" />
                      </svg>
                    </span>
                  </div>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                </div>
              </div>

              {/* Floating Action Button (+ FAB) */}
              <button
                type="button"
                className={styles.fabButton}
                style={{ background: buttonStyle, color: isSelected ? txtColor : '#FFFFFF' }}
                aria-label="New Post"
              >
                +
              </button>
            </div>
          )}

          {/* Bottom Navigation Bar */}
          <div className={styles.bottomNav}>
            <button
              type="button"
              className={`${styles.navItem} ${currentScreen === 'dashboard' ? styles.navItemActive : ''}`}
              style={{
                color: currentScreen === 'dashboard' ? (isSelected ? btnPri : '#38BDF8') : '#64748b',
              }}
              onClick={() => interactive && setActiveTabScreen('dashboard')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
              </svg>
              <span>Home</span>
            </button>
            <button
              type="button"
              className={`${styles.navItem} ${currentScreen === 'schedule' ? styles.navItemActive : ''}`}
              style={{
                color: currentScreen === 'schedule' ? (isSelected ? btnPri : '#38BDF8') : '#64748b',
              }}
              onClick={() => interactive && setActiveTabScreen('schedule')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <span>Schedule</span>
            </button>
            <button
              type="button"
              className={`${styles.navItem} ${currentScreen === 'feed' ? styles.navItemActive : ''}`}
              style={{
                color: currentScreen === 'feed' ? (isSelected ? btnPri : '#38BDF8') : '#64748b',
              }}
              onClick={() => interactive && setActiveTabScreen('feed')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
              </svg>
              <span>Feeds</span>
            </button>
            <button type="button" className={styles.navItem}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
              </svg>
              <span>Venue</span>
            </button>
            <button type="button" className={styles.navItem}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <span>Profile</span>
            </button>
          </div>
        </div>
      </div>
    );
  };

  // MULTI-SCREEN VIEW (Used in Event Form: shows Home, Schedule, and Feeds simultaneously)
  if (layout === 'all') {
    return (
      <div className={styles.allScreensContainer}>
        <div className={styles.allScreensHeader}>
          <div className={styles.previewTitle}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
              <line x1="12" y1="18" x2="12" y2="18" />
            </svg>
            Mobile Screens Live Preview
          </div>
          <div className={styles.themeStatusBadge}>
            {isSelected ? (
              <span className={styles.activeThemeBadge}>
                <span
                  className={styles.themeSwatchDot}
                  style={{ background: isBgGradient ? `linear-gradient(135deg, ${pri}, ${sec})` : pri }}
                />
                Custom Theme Active
              </span>
            ) : (
              <span className={styles.defaultThemeBadge}>Default Dark Theme (No Custom Theme Selected)</span>
            )}
          </div>
        </div>

        <div className={styles.multiScreensRow}>
          <div className={styles.screenCard}>
            <div className={styles.screenCardBadge}>1. Home Screen</div>
            {renderPhoneViewport('dashboard')}
          </div>
          <div className={styles.screenCard}>
            <div className={styles.screenCardBadge}>2. Schedule Screen</div>
            {renderPhoneViewport('schedule')}
          </div>
          <div className={styles.screenCard}>
            <div className={styles.screenCardBadge}>3. Feeds Screen</div>
            {renderPhoneViewport('feed')}
          </div>
        </div>
      </div>
    );
  }

  // SINGLE SCREEN VIEW WITH TABS (Used in compact color picker modals)
  return (
    <div className={styles.previewWrapper}>
      <div className={styles.previewHeader}>
        <span className={styles.previewTitle}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
            <line x1="12" y1="18" x2="12" y2="18" />
          </svg>
          Live Preview
        </span>
        <div className={styles.screenTabs}>
          <button
            type="button"
            className={`${styles.screenTabBtn} ${activeTabScreen === 'dashboard' ? styles.activeTab : ''}`}
            onClick={() => setActiveTabScreen('dashboard')}
          >
            Dashboard
          </button>
          <button
            type="button"
            className={`${styles.screenTabBtn} ${activeTabScreen === 'schedule' ? styles.activeTab : ''}`}
            onClick={() => setActiveTabScreen('schedule')}
          >
            Schedule
          </button>
          <button
            type="button"
            className={`${styles.screenTabBtn} ${activeTabScreen === 'feed' ? styles.activeTab : ''}`}
            onClick={() => setActiveTabScreen('feed')}
          >
            Feeds
          </button>
        </div>
      </div>

      {renderPhoneViewport(activeTabScreen, true)}
    </div>
  );
}
