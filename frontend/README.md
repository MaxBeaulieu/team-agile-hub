# Team Agile Hub Frontend

This is the Next.js frontend for Team Agile Hub.

## Local setup

```bash
cp .env.example .env.local
```

Fill in `.env.local` with values from your Supabase project:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_API_URL` (defaults to `http://localhost:5000`)

## Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Notes

- If `npm` is not recognized and you use Volta, run: `volta install node@20`
- If Supabase env vars are missing, auth-protected routes will not work until `.env.local` is configured.
