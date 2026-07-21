# Library Background Carousel

## Overview

The library page rotates through 20 randomly-selected local AI-art images (from `images/carousel/`) plus up to 20 randomly-selected real photographs from Unsplash, fetched weekly via the API. Total carousel size is dynamic (up to 40 images) and shuffles on each page load.

## Architecture

### Frontend

**Files:** `js/app.js`, `css/styles.css`, `index.html`

- **`setLibraryBackgroundCarousel()`**: Fetches local images, randomly selects 20, attempts authenticated fetch to `/api/library-backgrounds` for Unsplash images, merges and shuffles both lists.
- **`changeLibraryBackground()`**: Rotates every 30s. Updates background image and dynamically populates photographer attribution under "Welcome, email" if the image is from Unsplash.
- **Attribution element**: `<p>` sibling of `.library-top-subtext` in `.library-top-image`, styled light-grey (`#bfc3ca`), displays `Photo by [Photographer] on Unsplash` with utm-tagged links.

### API

**Files:** `D:\Apps\orator-api` (separate Laravel + Sanctum project)

- **Migration**: `library_backgrounds` table — `unsplash_id` (unique), `image_url` (hotlink), photographer metadata, `search_query`, dimensions, timestamps.
- **Model**: `App\Models\LibraryBackground`.
- **Command**: `unsplash:fetch-backgrounds` — Rotates through 4 search queries (`epic,reading,fantasy woman,space travel`). Fetches 30 from Unsplash, dedupes, takes 10 fresh ones, triggers download endpoint, saves metadata (not image bytes) to DB.
- **Schedule**: Cron + Laravel scheduler — runs Monday 08:00 Asia/Colombo.
- **Endpoint**: `GET /api/library-backgrounds` (Sanctum-protected) — returns 20 random backgrounds with photographer/Unsplash links (utm-tagged).

### Infrastructure

**Docker** (`D:\Apps\orator-api`):
- Dockerfile installs `cron` package.
- Entrypoint registers `/etc/cron.d/laravel-scheduler` (runs `php artisan schedule:run` every minute) and starts cron daemon.

**Config** (`.env`):
- `UNSPLASH_ACCESS_KEY`, `UNSPLASH_SECRET_KEY`, `UNSPLASH_APPLICATION_ID`.
- `UNSPLASH_SEARCH_QUERIES` CSV list (rotates on each command run, persisted in `storage/app/unsplash-run-count.txt`).

## Data Flow

1. Frontend loads library view → calls `setLibraryBackgroundCarousel()`.
2. Fetch & shuffle 20 local images from `images/carousel/images.json`.
3. If authenticated, fetch 20 random Unsplash images from `https://api.orator-audio.com/api/library-backgrounds`.
4. Merge both lists, shuffle, start 30s rotation.
5. Each rotation updates background image + photographer attribution (if Unsplash-sourced).

**Weekly (Monday 08:00 Asia/Colombo):**
1. Docker cron fires `php artisan schedule:run`.
2. Laravel scheduler runs `unsplash:fetch-backgrounds`.
3. Command pulls 10 new images from Unsplash API, dedupes against DB, triggers download endpoint, saves metadata to `library_backgrounds` table.

## Compliance

- **Unsplash hotlinking**: Images are served directly from Unsplash CDN (`urls.regular` 1080px).
- **Attribution**: Photographer name + Unsplash link displayed dynamically on each image rotation; links include `utm_source=orator&utm_medium=referral`.
- **Download trigger**: Unsplash `links.download` endpoint called once per photo to satisfy "trigger a download" guideline.

## Testing

```bash
# Manually run the fetch command
docker compose -f D:\Apps\orator-api\docker-compose.yml exec app php artisan unsplash:fetch-backgrounds

# Check scheduled timing
docker compose -f D:\Apps\orator-api\docker-compose.yml exec app php artisan schedule:list

# Verify API endpoint (with valid Sanctum token)
curl -H "Authorization: Bearer <token>" https://api.orator-audio.com/api/library-backgrounds
```

## Future Improvements

- Cache API response client-side to reduce weekly fetches if backgrounds don't change.
- Allow user-configurable search query via settings.
- Track which photographers have been displayed to avoid repeats within a session.
