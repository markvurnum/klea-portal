# Setting up on a new machine

Everything needed to work on the Klea portal from a computer that has never
seen it before. Roughly fifteen minutes.

---

## 1. Install the basics

You need **Node 22 or newer**, **Git**, and **Claude Code**.

Check what you already have:

```bash
node --version && git --version
```

If Node is missing or older than 22, install it from https://nodejs.org
(choose the LTS version).

---

## 2. Get the code

```bash
git clone https://github.com/markvurnum/klea-portal.git
cd klea-portal
npm install
```

The repository is private, so GitHub will ask you to sign in. Use the account
that has been given access.

---

## 3. Add the Guesty keys

The Guesty credentials are deliberately not stored in the code. Run the secure
form, which writes them to a local `.env` file that Git ignores:

```bash
npm run keys
```

Then open http://localhost:4750 and paste in the Client ID and Secret. They are
in Guesty under Integrations, and are **not** the Guesty account password.

If you do not have them, ask whoever set the system up. Without them everything
works except the Guesty sync, which will simply report that it is not connected.

---

## 4. Run it

```bash
npm run dev
```

Open http://localhost:4601. Sign in at `/#/admin` with the office login.

The first run creates its own demo data, so you get a full working system with
example clients, Kleaners and bookings to try things against. It does not touch
the live site.

---

## 5. Making a change

Claude Code reads `CLAUDE.md` in this folder automatically, so it already knows
the project, the business rules and the traps in the Guesty API. Just describe
what you want.

When you are happy:

```bash
npm run build    # confirms it compiles
git add -A
git commit -m "what you changed"
git push
```

Then it needs putting live. There are two ways, depending on how the hosting
has been set up:

**If GitHub deployment is connected (recommended):** pushing is all you do.
Railway sees the new code and puts it live within a couple of minutes.

**If not:** whoever holds the Railway access runs `npx @railway/cli up` from
this folder.

Either way, **check the live site** at https://portal.kleahome.co.uk afterwards
rather than assuming it worked.

---

## If something goes wrong on the live site

Every change is a Git commit, so you can always go back:

```bash
git log --oneline          # find the last good change
git revert <the-bad-one>
git push
```

That deploys the previous version. Nothing is ever permanently broken.

---

## Two safety rules

**Never commit credentials.** `.env` and `credentials.txt` are already excluded.
If you add a new key or password, put it in `.env` and never in a code file.

**The live database is real.** Once Klea are using it, those are real clients,
real staff records and real bookings. There is a "Clear everything and go live"
button in the admin area which is exactly as final as it sounds. Anything that
touches live data deserves a moment's thought first.

---

## Who owns what

| Thing | Where | Who controls it |
|---|---|---|
| The code | GitHub, private repo | Repo owner grants access |
| Hosting | Railway | Whoever owns the Railway account pays and controls it |
| The web address | Netlify DNS for kleahome.co.uk | Klea's web person |
| Guesty keys | Guesty account | Klea |

Changing hosting only needs one DNS record repointing, and one thing that is
easy to forget: **switch the old service off**, or two copies will both sync
Guesty and split the bookings between two databases.
